from __future__ import annotations

from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Call, CallEvent, OperatorSession, Recording, TranscriptEntry
from app.models.enums import CallLanguage, CallStatus, DisclosurePolicy, UISupportedLanguage


class CallRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_call(
        self,
        *,
        destination_number: str,
        task_prompt: str,
        ui_language: UISupportedLanguage,
        call_language: CallLanguage,
        disclosure_policy: DisclosurePolicy,
        recording_enabled: bool,
    ) -> Call:
        call = Call(
            destination_number=destination_number,
            task_prompt=task_prompt,
            ui_language=ui_language,
            call_language=call_language,
            disclosure_policy=disclosure_policy,
            recording_enabled=recording_enabled,
            status=CallStatus.QUEUED,
        )
        self.db.add(call)
        self.db.flush()
        self.add_event(call.id, "call_created", {"status": call.status.value})
        self.db.commit()
        self.db.refresh(call)
        return call

    def get_call(self, call_id: str) -> Call | None:
        stmt = (
            select(Call)
            .where(Call.id == call_id)
            .options(
                selectinload(Call.events),
                selectinload(Call.transcript_entries),
                selectinload(Call.recordings),
                selectinload(Call.operator_sessions),
            )
        )
        return self.db.scalar(stmt)

    def list_calls(self) -> list[Call]:
        stmt = select(Call).order_by(Call.updated_at.desc())
        return list(self.db.scalars(stmt).all())

    def get_by_telnyx_call_control_id(self, call_control_id: str) -> Call | None:
        stmt = select(Call).where(
            or_(
                Call.telnyx_call_control_id == call_control_id,
                Call.telnyx_operator_call_control_id == call_control_id,
            )
        )
        return self.db.scalar(stmt)

    def update_call(self, call: Call, **fields) -> Call:
        for key, value in fields.items():
            setattr(call, key, value)
        call.updated_at = datetime.utcnow()
        self.db.add(call)
        self.db.flush()
        return call

    def add_event(self, call_id: str, event_type: str, payload: dict) -> CallEvent:
        event = CallEvent(call_id=call_id, type=event_type, payload_json=payload)
        self.db.add(event)
        self.db.flush()
        return event

    def add_transcript(
        self,
        call_id: str,
        *,
        speaker: str,
        text: str,
        source: str,
        language: str,
        is_final: bool,
    ) -> TranscriptEntry:
        entry = TranscriptEntry(
            call_id=call_id,
            speaker=speaker,
            text=text,
            source=source,
            language=language,
            is_final=is_final,
        )
        self.db.add(entry)
        self.db.flush()
        return entry

    def upsert_recording(
        self,
        call_id: str,
        *,
        telnyx_recording_id: str | None,
        telnyx_recording_status: str | None,
        remote_url: str | None = None,
        local_file_path: str | None = None,
        duration_seconds: int | None = None,
        content_type: str | None = None,
    ) -> Recording:
        recording = self.db.scalar(select(Recording).where(Recording.call_id == call_id))
        if recording is None:
            recording = Recording(call_id=call_id)
            self.db.add(recording)
        recording.telnyx_recording_id = telnyx_recording_id
        recording.telnyx_recording_status = telnyx_recording_status
        recording.remote_url = remote_url
        recording.local_file_path = local_file_path
        recording.duration_seconds = duration_seconds
        recording.content_type = content_type
        self.db.flush()
        return recording

    def create_operator_session(self, call_id: str, identity: str, token_expires_at: datetime | None) -> OperatorSession:
        session = OperatorSession(call_id=call_id, identity=identity, token_expires_at=token_expires_at)
        self.db.add(session)
        self.db.flush()
        return session

    def latest_operator_session(self, call_id: str) -> OperatorSession | None:
        stmt = (
            select(OperatorSession)
            .where(OperatorSession.call_id == call_id)
            .order_by(OperatorSession.id.desc())
        )
        return self.db.scalar(stmt)
