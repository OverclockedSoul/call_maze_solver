import pytest
from pydantic import ValidationError

from app.models.enums import CallLanguage, DisclosurePolicy, UISupportedLanguage
from app.schemas.calls import StartCallRequest


def test_start_call_request_accepts_e164() -> None:
    payload = StartCallRequest(
        destination_number="+34910000000",
        task_prompt="Ask for claim status.",
        ui_language=UISupportedLanguage.EN,
        call_language=CallLanguage.ES_ES,
        disclosure_policy=DisclosurePolicy.CONDITIONAL,
        recording_enabled=True,
    )
    assert payload.destination_number == "+34910000000"


def test_start_call_request_rejects_invalid_phone() -> None:
    with pytest.raises(ValidationError):
        StartCallRequest(
            destination_number="910000000",
            task_prompt="Ask for claim status.",
            ui_language=UISupportedLanguage.EN,
            call_language=CallLanguage.ES_ES,
            disclosure_policy=DisclosurePolicy.CONDITIONAL,
            recording_enabled=True,
        )
