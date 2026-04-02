from app.models.enums import CallStatus
from app.services.call_orchestrator import ALLOWED_TRANSITIONS


def test_state_machine_allows_expected_handoff_path() -> None:
    assert CallStatus.HANDOFF_REQUESTED in ALLOWED_TRANSITIONS[CallStatus.AGENT_ACTIVE]
    assert CallStatus.HUMAN_JOINING in ALLOWED_TRANSITIONS[CallStatus.HANDOFF_REQUESTED]
    assert CallStatus.HUMAN_ACTIVE in ALLOWED_TRANSITIONS[CallStatus.HUMAN_JOINING]


def test_completed_calls_have_no_next_states() -> None:
    assert ALLOWED_TRANSITIONS[CallStatus.COMPLETED] == set()
