from __future__ import annotations

import base64
import json
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

from app.core.settings import Settings
from app.models import Call
from app.models.enums import CallLanguage


@dataclass
class TelnyxCallHandle:
    call_control_id: str
    call_leg_id: str | None
    call_session_id: str | None


@dataclass
class TelnyxAPIError(Exception):
    status_code: int
    detail: str
    response_body: dict[str, Any] | str | None = None


class TelnyxIntegration:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.base_url = "https://api.telnyx.com/v2"

    def create_outbound_call(self, call: Call) -> TelnyxCallHandle:
        payload = {
            "connection_id": self.settings.telnyx_connection_id,
            "from": self.settings.telnyx_phone_number,
            "to": call.destination_number,
            "webhook_url": f"{self.settings.public_base_url.rstrip('/')}/webhooks/telnyx/voice",
            "webhook_url_method": "POST",
            "client_state": self.encode_client_state({"call_id": call.id, "role": "customer"}),
        }
        response = self._request("POST", "/calls", json=payload)
        data = response.get("data", {})
        return TelnyxCallHandle(
            call_control_id=data["call_control_id"],
            call_leg_id=data.get("call_leg_id"),
            call_session_id=data.get("call_session_id"),
        )

    def create_operator_call(self, call: Call) -> TelnyxCallHandle:
        payload = {
            "connection_id": self.settings.telnyx_connection_id,
            "from": self.settings.telnyx_phone_number,
            "to": self.operator_sip_uri,
            "webhook_url": f"{self.settings.public_base_url.rstrip('/')}/webhooks/telnyx/voice",
            "webhook_url_method": "POST",
            "client_state": self.encode_client_state({"call_id": call.id, "role": "operator"}),
        }
        response = self._request("POST", "/calls", json=payload)
        data = response.get("data", {})
        return TelnyxCallHandle(
            call_control_id=data["call_control_id"],
            call_leg_id=data.get("call_leg_id"),
            call_session_id=data.get("call_session_id"),
        )

    def speak_text(self, call_control_id: str, text: str, language: CallLanguage | str, *, client_state: dict[str, Any]) -> None:
        lang = language.value if isinstance(language, CallLanguage) else language
        body = {
            "payload": text[:3000],
            "payload_type": "text",
            "service_level": "premium",
            "voice": self.voice_for_language(lang),
            "voice_settings": {"language": lang},
            "client_state": self.encode_client_state(client_state),
        }
        self._request("POST", f"/calls/{call_control_id}/actions/speak", json=body)

    def send_dtmf(self, call_control_id: str, digits: str, *, client_state: dict[str, Any]) -> None:
        self._request(
            "POST",
            f"/calls/{call_control_id}/actions/send_dtmf",
            json={"digits": digits, "client_state": self.encode_client_state(client_state)},
        )

    def start_transcription(self, call_control_id: str, *, client_state: dict[str, Any]) -> None:
        body = {
            "transcription_engine": "Google",
            "transcription_tracks": "both",
            "client_state": self.encode_client_state(client_state),
        }
        self._request("POST", f"/calls/{call_control_id}/actions/transcription_start", json=body)

    def start_recording(self, call_control_id: str, call_id: str, *, client_state: dict[str, Any]) -> None:
        body = {
            "channels": "single",
            "format": "mp3",
            "custom_file_name": call_id[:40],
            "client_state": self.encode_client_state(client_state),
        }
        self._request("POST", f"/calls/{call_control_id}/actions/record_start", json=body)

    def bridge_calls(self, call_control_id: str, other_call_control_id: str, *, client_state: dict[str, Any], record: bool) -> None:
        body: dict[str, Any] = {
            "call_control_id": other_call_control_id,
            "play_ringtone": True,
            "ringtone": "es",
            "client_state": self.encode_client_state(client_state),
        }
        if record:
            body["record"] = "record-from-answer"
            body["record_format"] = "mp3"
            body["record_channels"] = "single"
        self._request("POST", f"/calls/{call_control_id}/actions/bridge", json=body)

    def hangup_call(self, call_control_id: str | None) -> None:
        if not call_control_id:
            return
        self._request("POST", f"/calls/{call_control_id}/actions/hangup", json={})

    def generate_webrtc_login_token(self) -> str | None:
        if not self.settings.telnyx_telephony_credential_id:
            return None
        response = httpx.post(
            f"{self.base_url}/telephony_credentials/{self.settings.telnyx_telephony_credential_id}/token",
            headers=self._headers(),
            timeout=30.0,
        )
        response.raise_for_status()
        return response.text.strip().strip('"')

    def mirror_recording(self, recording_url: str, call_id: str, recording_id: str | None) -> Path | None:
        try:
            response = httpx.get(recording_url, headers=self._headers(), timeout=60.0)
            response.raise_for_status()
        except httpx.HTTPError:
            return None

        filename = f"{call_id}-{recording_id or uuid.uuid4().hex}.mp3"
        output_path = Path(self.settings.recording_mirror_dir) / filename
        output_path.write_bytes(response.content)
        return output_path

    def validate_webhook_signature(self, raw_body: bytes, signature: str | None, timestamp: str | None) -> bool:
        if not self.settings.telnyx_public_key:
            return True
        if not signature or not timestamp:
            return False

        try:
            message = f"{timestamp}|{raw_body.decode('utf-8')}".encode("utf-8")
            signature_bytes = base64.b64decode(signature)
            self._verify_key().verify(message, signature_bytes)
            return True
        except Exception:
            return False

    def decode_client_state(self, value: str | None) -> dict[str, Any]:
        if not value:
            return {}
        try:
            decoded = base64.b64decode(value.encode("utf-8"))
            return json.loads(decoded.decode("utf-8"))
        except Exception:
            return {}

    def encode_client_state(self, payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return base64.b64encode(raw).decode("utf-8")

    @property
    def operator_sip_uri(self) -> str:
        return f"sip:{self.settings.telnyx_sip_username}@{self.settings.telnyx_sip_domain}"

    def voice_for_language(self, language: str) -> str:
        if language == CallLanguage.ES_ES.value:
            return self.settings.telnyx_voice_es_es
        return self.settings.telnyx_voice_en_us

    def _verify_key(self) -> VerifyKey:
        key = self.settings.telnyx_public_key.strip()
        try:
            return VerifyKey(bytes.fromhex(key))
        except ValueError:
            return VerifyKey(base64.b64decode(key))

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.settings.telnyx_api_key}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, path: str, *, json: dict[str, Any]) -> dict[str, Any]:
        response = httpx.request(
            method,
            f"{self.base_url}{path}",
            headers=self._headers(),
            json=json,
            timeout=30.0,
        )
        if response.is_error:
            try:
                payload = response.json()
            except Exception:
                payload = response.text

            detail = f"Telnyx API error ({response.status_code})"
            if isinstance(payload, dict):
                errors = payload.get("errors") or []
                if errors and isinstance(errors, list):
                    first = errors[0]
                    if isinstance(first, dict) and first.get("detail"):
                        detail = first["detail"]
            raise TelnyxAPIError(status_code=response.status_code, detail=detail, response_body=payload)
        if not response.content:
            return {}
        return response.json()
