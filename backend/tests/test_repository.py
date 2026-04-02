from app.models.enums import CallLanguage, DisclosurePolicy, UISupportedLanguage
from app.repositories.calls import CallRepository


def test_repository_persists_call_and_event(db_session) -> None:
    repo = CallRepository(db_session)
    call = repo.create_call(
        destination_number="+34910000000",
        task_prompt="Ask for claim status.",
        ui_language=UISupportedLanguage.EN,
        call_language=CallLanguage.ES_ES,
        disclosure_policy=DisclosurePolicy.CONDITIONAL,
        recording_enabled=True,
    )
    loaded = repo.get_call(call.id)
    assert loaded is not None
    assert loaded.destination_number == "+34910000000"
    assert loaded.events[0].type == "call_created"
