from app.core.settings import get_settings
from app.integrations.ai import AIOrchestrator
from app.models.call import Call
from app.models.enums import CallLanguage, DisclosurePolicy, UISupportedLanguage


def build_call() -> Call:
    return Call(
        destination_number="+34123456789",
        task_prompt="Ask for an update on insurance case 1234.",
        ui_language=UISupportedLanguage.EN,
        call_language=CallLanguage.ES_ES,
        disclosure_policy=DisclosurePolicy.CONDITIONAL,
        recording_enabled=True,
    )


def test_ai_returns_dtmf_for_menu_prompt() -> None:
    orchestrator = AIOrchestrator(get_settings())
    intent = orchestrator.decide_next_action(build_call(), "For billing, press 2.")
    assert intent.name == "send_digits"
    assert intent.arguments["digits"] == "2"


def test_ai_requests_takeover_for_human_need() -> None:
    orchestrator = AIOrchestrator(get_settings())
    intent = orchestrator.decide_next_action(build_call(), "Please speak to a human representative.")
    assert intent.name == "request_human_takeover"
