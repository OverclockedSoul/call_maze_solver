from datetime import datetime

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import CallLanguage, CallStatus, DisclosurePolicy, UISupportedLanguage


class StartCallRequest(BaseModel):
    destination_number: str = Field(min_length=8, max_length=32)
    task_prompt: str = Field(min_length=5)
    ui_language: UISupportedLanguage = UISupportedLanguage.ES
    call_language: CallLanguage = CallLanguage.ES_ES
    disclosure_policy: DisclosurePolicy = DisclosurePolicy.CONDITIONAL
    recording_enabled: bool = True

    @field_validator("destination_number")
    @classmethod
    def validate_e164(cls, value: str) -> str:
        if not value.startswith("+") or not value[1:].isdigit():
            raise ValueError("destination_number must be in E.164 format")
        return value


class CallResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    call_id: str
    status: CallStatus


class CallEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    created_at: datetime
    type: str
    payload_json: dict


class TranscriptEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    created_at: datetime
    speaker: str
    text: str
    source: str
    language: str
    is_final: bool


class RecordingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    telnyx_recording_id: str | None
    telnyx_recording_status: str | None
    remote_url: str | None
    local_file_path: str | None
    duration_seconds: int | None
    content_type: str | None


class CallDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    ended_at: datetime | None
    destination_number: str
    task_prompt: str
    ui_language: UISupportedLanguage
    call_language: CallLanguage
    disclosure_policy: DisclosurePolicy
    recording_enabled: bool
    status: CallStatus
    outcome_summary: str | None
    failure_reason: str | None
    telnyx_call_control_id: str | None
    telnyx_call_leg_id: str | None
    telnyx_call_session_id: str | None
    telnyx_operator_call_control_id: str | None
    telnyx_operator_call_leg_id: str | None
    telnyx_operator_call_session_id: str | None
    transcript_entries: list[TranscriptEntryResponse] = []
    events: list[CallEventResponse] = []
    recordings: list[RecordingResponse] = []


class TakeoverResponse(BaseModel):
    call_id: str
    status: CallStatus


class VoiceTokenResponse(BaseModel):
    token: str | None
    identity: str
    sip_uri: str
    sip_username: str | None = None
    sip_password: str | None = None


class HangupResponse(BaseModel):
    call_id: str
    status: CallStatus


class OperatorSessionEventRequest(BaseModel):
    event: Literal["ready", "joined", "left"]
