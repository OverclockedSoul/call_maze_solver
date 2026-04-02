from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.settings import get_settings
from app.integrations.ai import AIOrchestrator, ToolIntent
from app.integrations.telnyx import TelnyxAPIError, TelnyxIntegration
from app.models import Call
from app.models.enums import CallStatus
from app.repositories.calls import CallRepository
from app.schemas.calls import StartCallRequest
from app.services.browser_events import browser_event_hub


ALLOWED_TRANSITIONS: dict[CallStatus, set[CallStatus]] = {
    CallStatus.QUEUED: {CallStatus.DIALING, CallStatus.FAILED},
    CallStatus.DIALING: {CallStatus.IVR, CallStatus.AGENT_ACTIVE, CallStatus.COMPLETED, CallStatus.FAILED},
    CallStatus.IVR: {CallStatus.AGENT_ACTIVE, CallStatus.HANDOFF_REQUESTED, CallStatus.COMPLETED, CallStatus.FAILED},
    CallStatus.AGENT_ACTIVE: {CallStatus.HANDOFF_REQUESTED, CallStatus.COMPLETED, CallStatus.FAILED},
    CallStatus.HANDOFF_REQUESTED: {CallStatus.HUMAN_JOINING, CallStatus.FAILED},
    CallStatus.HUMAN_JOINING: {CallStatus.HUMAN_ACTIVE, CallStatus.COMPLETED, CallStatus.FAILED},
    CallStatus.HUMAN_ACTIVE: {CallStatus.COMPLETED, CallStatus.FAILED},
    CallStatus.COMPLETED: set(),
    CallStatus.FAILED: set(),
}


@dataclass
class HandoffToken:
    token: str | None
    identity: str
    sip_uri: str
    expires_at: datetime
    sip_username: str | None = None
    sip_password: str | None = None


class CallOrchestrator:
    def __init__(self, db: Session):
        self.db = db
        self.repo = CallRepository(db)
        self.settings = get_settings()
        self.telnyx = TelnyxIntegration(self.settings)
        self.ai = AIOrchestrator(self.settings)

    async def create_call(self, request: StartCallRequest) -> Call:
        call = self.repo.create_call(
            destination_number=request.destination_number,
            task_prompt=request.task_prompt,
            ui_language=request.ui_language,
            call_language=request.call_language,
            disclosure_policy=request.disclosure_policy,
            recording_enabled=request.recording_enabled,
        )
        try:
            handle = self.telnyx.create_outbound_call(call)
        except TelnyxAPIError as exc:
            self.repo.update_call(call, status=CallStatus.FAILED, failure_reason=exc.detail, ended_at=datetime.utcnow())
            self.repo.add_event(call.id, "telnyx_call_failed", {"status_code": exc.status_code, "detail": exc.detail})
            self.db.commit()
            await browser_event_hub.broadcast(call.id, {"type": "status", "status": CallStatus.FAILED.value, "detail": exc.detail})
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.detail) from exc
        self.repo.update_call(
            call,
            telnyx_call_control_id=handle.call_control_id,
            telnyx_call_leg_id=handle.call_leg_id,
            telnyx_call_session_id=handle.call_session_id,
            status=CallStatus.DIALING,
            started_at=datetime.utcnow(),
        )
        self.repo.add_event(call.id, "telnyx_call_initiated", {"call_control_id": handle.call_control_id})
        self.db.commit()
        await browser_event_hub.broadcast(call.id, {"type": "status", "status": CallStatus.DIALING.value})
        return self.get_call(call.id)

    def list_calls(self) -> list[Call]:
        return self.repo.list_calls()

    def get_call(self, call_id: str) -> Call:
        call = self.repo.get_call(call_id)
        if call is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")
        return call

    def transition(self, call: Call, next_status: CallStatus, *, reason: str | None = None) -> Call:
        if next_status not in ALLOWED_TRANSITIONS[call.status]:
            self.repo.add_event(call.id, "invalid_status_transition", {"from": call.status.value, "to": next_status.value, "reason": reason})
            self.db.commit()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invalid status transition")

        updates: dict[str, Any] = {"status": next_status}
        if next_status in {CallStatus.COMPLETED, CallStatus.FAILED}:
            updates["ended_at"] = datetime.utcnow()
        if next_status == CallStatus.FAILED and reason:
            updates["failure_reason"] = reason
        self.repo.update_call(call, **updates)
        self.repo.add_event(call.id, "status_changed", {"status": next_status.value, "reason": reason})
        self.db.commit()
        return self.get_call(call.id)

    async def hangup(self, call_id: str) -> Call:
        call = self.get_call(call_id)
        self.telnyx.hangup_call(call.telnyx_call_control_id)
        self.telnyx.hangup_call(call.telnyx_operator_call_control_id)
        if call.status not in {CallStatus.COMPLETED, CallStatus.FAILED}:
            call = self.transition(call, CallStatus.COMPLETED, reason="operator requested hangup")
        await browser_event_hub.broadcast(call.id, {"type": "status", "status": call.status.value})
        self._export_transcript(call)
        return call

    async def request_takeover(self, call_id: str, reason: str = "operator requested takeover") -> Call:
        call = self.get_call(call_id)
        if call.status not in {CallStatus.IVR, CallStatus.AGENT_ACTIVE}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Call is not eligible for takeover")
        call = self.transition(call, CallStatus.HANDOFF_REQUESTED, reason=reason)
        self.repo.add_event(call.id, "takeover_requested", {"reason": reason})
        self.db.commit()
        await browser_event_hub.broadcast(call.id, {"type": "handoff_requested", "reason": reason})
        return self.get_call(call.id)

    def issue_operator_token(self, call_id: str) -> HandoffToken:
        call = self.get_call(call_id)
        if call.status not in {CallStatus.HANDOFF_REQUESTED, CallStatus.HUMAN_JOINING}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Call is not in handoff flow")
        identity = "operator-main"
        expires_at = datetime.utcnow() + timedelta(hours=1)
        token = self.telnyx.generate_webrtc_login_token()
        self.repo.create_operator_session(call.id, identity, expires_at)
        self.repo.add_event(call.id, "operator_token_issued", {"identity": identity, "sip_uri": self.telnyx.operator_sip_uri})
        self.db.commit()
        return HandoffToken(
            token=token,
            identity=identity,
            sip_uri=self.telnyx.operator_sip_uri,
            expires_at=expires_at,
            sip_username=self.settings.telnyx_sip_username or None,
            sip_password=self.settings.telnyx_sip_password or None,
        )

    async def record_operator_activity(self, call_id: str, event: str) -> Call:
        call = self.get_call(call_id)
        session = self.repo.latest_operator_session(call_id)
        if session is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operator session not found")

        if event == "ready":
            if call.status not in {CallStatus.HANDOFF_REQUESTED, CallStatus.HUMAN_JOINING}:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Call is not waiting for operator join")
            if not call.telnyx_operator_call_control_id:
                handle = self.telnyx.create_operator_call(call)
                self.repo.update_call(
                    call,
                    status=CallStatus.HUMAN_JOINING,
                    telnyx_operator_call_control_id=handle.call_control_id,
                    telnyx_operator_call_leg_id=handle.call_leg_id,
                    telnyx_operator_call_session_id=handle.call_session_id,
                )
                self.repo.add_event(call.id, "operator_leg_dialed", {"call_control_id": handle.call_control_id})
                self.db.commit()
                await browser_event_hub.broadcast(call.id, {"type": "status", "status": CallStatus.HUMAN_JOINING.value})
                return self.get_call(call.id)
        elif event == "joined":
            session.joined_at = datetime.utcnow()
            if call.status == CallStatus.HUMAN_JOINING:
                call = self.transition(call, CallStatus.HUMAN_ACTIVE, reason="operator joined browser call")
        elif event == "left":
            session.left_at = datetime.utcnow()
            if call.status == CallStatus.HUMAN_ACTIVE:
                self.repo.add_event(call.id, "operator_left", {"identity": session.identity})
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported operator activity")

        self.db.add(session)
        self.repo.add_event(call.id, f"operator_{event}", {"identity": session.identity})
        self.db.commit()
        await browser_event_hub.broadcast(call.id, {"type": f"operator_{event}", "identity": session.identity})
        return self.get_call(call.id)

    async def add_transcript_and_publish(
        self,
        call: Call,
        *,
        speaker: str,
        text: str,
        source: str,
        language: str,
        is_final: bool,
    ) -> None:
        self.repo.add_transcript(call.id, speaker=speaker, text=text, source=source, language=language, is_final=is_final)
        self.db.commit()
        await browser_event_hub.broadcast(call.id, {"type": "transcript", "speaker": speaker, "text": text, "language": language, "final": is_final})

    async def add_event_and_publish(self, call: Call, event_type: str, payload: dict) -> None:
        self.repo.add_event(call.id, event_type, payload)
        self.db.commit()
        await browser_event_hub.broadcast(call.id, {"type": event_type, **payload})

    async def handle_reasoning(self, call: Call, prompt_text: str, detected_language: str | None = None) -> None:
        intent = self.ai.decide_next_action(call, prompt_text)
        await self._apply_intent(call, intent, detected_language or call.call_language.value)

    async def handle_telnyx_event(self, event: dict[str, Any]) -> Call | None:
        data = event.get("data", {})
        payload = data.get("payload", {})
        event_type = data.get("event_type")
        if not event_type:
            return None

        call = self._resolve_call_from_payload(payload)
        if call is None:
            return None

        state = self.telnyx.decode_client_state(payload.get("client_state"))
        role = state.get("role", "customer")
        self.repo.add_event(call.id, "telnyx_webhook", {"event_type": event_type, "role": role})
        self.db.commit()

        if event_type == "call.initiated":
            self._sync_leg_ids(call, payload, role)
        elif event_type == "call.answered":
            await self._handle_answered(call, payload, role)
        elif event_type == "call.transcription":
            await self._handle_transcription(call, payload)
        elif event_type == "call.recording.saved":
            await self._handle_recording_saved(call, payload)
        elif event_type == "call.bridged":
            await self.add_event_and_publish(call, "call_bridged", {"role": role})
        elif event_type == "call.dtmf.received":
            digits = payload.get("digits")
            if digits:
                await self.add_event_and_publish(call, "dtmf_received", {"digits": digits})
        elif event_type == "call.hangup":
            await self._handle_hangup(call, payload, role)

        return self.get_call(call.id)

    async def _apply_intent(self, call: Call, intent: ToolIntent, language: str) -> None:
        if not call.telnyx_call_control_id:
            return

        if intent.name == "send_digits":
            self.telnyx.send_dtmf(
                call.telnyx_call_control_id,
                intent.arguments["digits"],
                client_state={"call_id": call.id, "role": "customer"},
            )
            await self.add_event_and_publish(call, "dtmf_sent", {"digits": intent.arguments["digits"]})
            if call.status == CallStatus.DIALING:
                call = self.transition(call, CallStatus.IVR, reason="ivr navigation started")
                await browser_event_hub.broadcast(call.id, {"type": "status", "status": call.status.value})
        elif intent.name == "speak_text":
            self.telnyx.speak_text(
                call.telnyx_call_control_id,
                intent.arguments["text"],
                language,
                client_state={"call_id": call.id, "role": "customer"},
            )
            await self.add_transcript_and_publish(call, speaker="agent", text=intent.arguments["text"], source="telnyx_tts", language=language, is_final=True)
            if call.status == CallStatus.DIALING:
                call = self.transition(call, CallStatus.AGENT_ACTIVE, reason="agent spoke")
                await browser_event_hub.broadcast(call.id, {"type": "status", "status": call.status.value})
        elif intent.name == "request_human_takeover":
            await self.request_takeover(call.id, reason=intent.arguments["reason"])
        elif intent.name == "end_call":
            await self.hangup(call.id)

    def _resolve_call_from_payload(self, payload: dict[str, Any]) -> Call | None:
        state = self.telnyx.decode_client_state(payload.get("client_state"))
        if state.get("call_id"):
            return self.repo.get_call(state["call_id"])
        if payload.get("call_control_id"):
            return self.repo.get_by_telnyx_call_control_id(payload["call_control_id"])
        return None

    def _sync_leg_ids(self, call: Call, payload: dict[str, Any], role: str) -> None:
        if role == "operator":
            updates = {
                "telnyx_operator_call_control_id": payload.get("call_control_id"),
                "telnyx_operator_call_leg_id": payload.get("call_leg_id"),
                "telnyx_operator_call_session_id": payload.get("call_session_id"),
            }
        else:
            updates = {
                "telnyx_call_control_id": payload.get("call_control_id"),
                "telnyx_call_leg_id": payload.get("call_leg_id"),
                "telnyx_call_session_id": payload.get("call_session_id"),
            }
        self.repo.update_call(call, **updates)
        self.db.commit()

    async def _handle_answered(self, call: Call, payload: dict[str, Any], role: str) -> None:
        self._sync_leg_ids(call, payload, role)
        refreshed = self.get_call(call.id)
        if role == "operator":
            if refreshed.telnyx_operator_call_control_id and refreshed.telnyx_call_control_id:
                if refreshed.status == CallStatus.HANDOFF_REQUESTED:
                    refreshed = self.transition(refreshed, CallStatus.HUMAN_JOINING, reason="operator leg answered")
                self.telnyx.bridge_calls(
                    refreshed.telnyx_operator_call_control_id,
                    refreshed.telnyx_call_control_id,
                    client_state={"call_id": refreshed.id, "role": "operator"},
                    record=refreshed.recording_enabled,
                )
                await self.add_event_and_publish(refreshed, "operator_answered", {"bridging": True})
            return

        if refreshed.status == CallStatus.DIALING:
            refreshed = self.transition(refreshed, CallStatus.AGENT_ACTIVE, reason="telnyx call answered")
            await browser_event_hub.broadcast(refreshed.id, {"type": "status", "status": refreshed.status.value})

        if refreshed.telnyx_call_control_id:
            self.telnyx.start_transcription(
                refreshed.telnyx_call_control_id,
                client_state={"call_id": refreshed.id, "role": "customer"},
            )
            if refreshed.recording_enabled:
                self.telnyx.start_recording(
                    refreshed.telnyx_call_control_id,
                    refreshed.id,
                    client_state={"call_id": refreshed.id, "role": "customer"},
                )
        await self.handle_reasoning(refreshed, refreshed.task_prompt, detected_language=refreshed.call_language.value)

    async def _handle_transcription(self, call: Call, payload: dict[str, Any]) -> None:
        transcription = payload.get("transcription_data", {})
        text = transcription.get("transcript")
        if not text:
            return
        is_final = bool(transcription.get("is_final", False))
        await self.add_transcript_and_publish(
            call,
            speaker="remote",
            text=text,
            source="telnyx_transcription",
            language=call.call_language.value,
            is_final=is_final,
        )
        refreshed = self.get_call(call.id)
        if is_final and refreshed.status in {CallStatus.DIALING, CallStatus.IVR, CallStatus.AGENT_ACTIVE}:
            await self.handle_reasoning(refreshed, text, detected_language=refreshed.call_language.value)

    async def _handle_recording_saved(self, call: Call, payload: dict[str, Any]) -> None:
        recording_urls = payload.get("public_recording_urls") or payload.get("recording_urls") or {}
        remote_url = recording_urls.get("mp3") or recording_urls.get("wav")
        duration_seconds = None
        started_at = payload.get("recording_started_at")
        ended_at = payload.get("recording_ended_at")
        if started_at and ended_at:
            try:
                start_dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                end_dt = datetime.fromisoformat(ended_at.replace("Z", "+00:00"))
                duration_seconds = max(int((end_dt - start_dt).total_seconds()), 0)
            except ValueError:
                duration_seconds = None

        recording = self.repo.upsert_recording(
            call.id,
            telnyx_recording_id=payload.get("recording_id") or payload.get("call_leg_id"),
            telnyx_recording_status="saved",
            remote_url=remote_url,
            duration_seconds=duration_seconds,
            content_type="audio/mpeg" if remote_url and remote_url.endswith(".mp3") else "audio/wav",
        )
        self.db.commit()
        await browser_event_hub.broadcast(call.id, {"type": "recording_ready", "recording_id": str(recording.id)})
        if remote_url:
            local_path = self.telnyx.mirror_recording(remote_url, call.id, payload.get("recording_id"))
            if local_path:
                self.repo.upsert_recording(
                    call.id,
                    telnyx_recording_id=payload.get("recording_id") or payload.get("call_leg_id"),
                    telnyx_recording_status="saved",
                    remote_url=remote_url,
                    local_file_path=str(local_path),
                    duration_seconds=duration_seconds,
                    content_type="audio/mpeg" if remote_url.endswith(".mp3") else "audio/wav",
                )
                self.db.commit()

    async def _handle_hangup(self, call: Call, payload: dict[str, Any], role: str) -> None:
        self._sync_leg_ids(call, payload, role)
        refreshed = self.get_call(call.id)
        hangup_cause = (payload.get("hangup_cause") or payload.get("state") or "").lower()

        if role == "operator":
            session = self.repo.latest_operator_session(refreshed.id)
            if session and session.left_at is None:
                session.left_at = datetime.utcnow()
                self.db.add(session)
                self.db.commit()
            await self.add_event_and_publish(refreshed, "operator_leg_hangup", {"cause": hangup_cause or "unknown"})
            return

        if refreshed.status not in {CallStatus.COMPLETED, CallStatus.FAILED}:
            failure_causes = {"busy", "no-answer", "failed", "rejected", "timeout"}
            next_status = CallStatus.FAILED if hangup_cause in failure_causes else CallStatus.COMPLETED
            refreshed = self.transition(refreshed, next_status, reason=hangup_cause or "remote hangup")
        await browser_event_hub.broadcast(refreshed.id, {"type": "status", "status": refreshed.status.value})
        self._export_transcript(refreshed)

    def _export_transcript(self, call: Call) -> None:
        refreshed = self.get_call(call.id)
        transcript_path = Path(self.settings.transcript_export_dir) / f"{refreshed.id}.txt"
        lines = [f"[{entry.created_at.isoformat()}] {entry.speaker}: {entry.text}" for entry in refreshed.transcript_entries]
        transcript_path.write_text("\n".join(lines), encoding="utf-8")
