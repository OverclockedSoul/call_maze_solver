from app.integrations.telnyx import TelnyxCallHandle, TelnyxIntegration


def test_start_call_validation_error(client) -> None:
    response = client.post(
        "/api/calls",
        json={
            "destination_number": "1234",
            "task_prompt": "Ask for claim status.",
            "ui_language": "en",
            "call_language": "es-ES",
            "disclosure_policy": "conditional",
            "recording_enabled": True,
        },
    )
    assert response.status_code == 422


def test_start_call_success(client, monkeypatch) -> None:
    monkeypatch.setattr(
        TelnyxIntegration,
        "create_outbound_call",
        lambda self, call: TelnyxCallHandle("call-control-test", "call-leg-test", "call-session-test"),
    )
    response = client.post(
        "/api/calls",
        json={
            "destination_number": "+34910000000",
            "task_prompt": "Ask for claim status.",
            "ui_language": "en",
            "call_language": "es-ES",
            "disclosure_policy": "conditional",
            "recording_enabled": True,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "dialing"
    assert "call_id" in payload
