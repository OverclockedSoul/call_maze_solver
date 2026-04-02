from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db.session import SessionLocal
from app.services.browser_events import browser_event_hub
from app.services.call_orchestrator import CallOrchestrator


router = APIRouter()


@router.websocket("/ws/calls/{call_id}")
async def browser_call_socket(websocket: WebSocket, call_id: str) -> None:
    db = SessionLocal()
    orchestrator = CallOrchestrator(db)
    call = orchestrator.get_call(call_id)
    await browser_event_hub.connect(call_id, websocket)
    await websocket.send_json({"type": "status", "status": call.status.value})
    for entry in call.transcript_entries:
        await websocket.send_json(
            {
                "type": "transcript",
                "speaker": entry.speaker,
                "text": entry.text,
                "language": entry.language,
                "final": entry.is_final,
            }
        )
    try:
        while True:
            message = await websocket.receive_json()
            if message.get("type") == "takeover":
                await orchestrator.request_takeover(call_id, reason="operator requested takeover from browser websocket")
            if message.get("type") == "hangup":
                await orchestrator.hangup(call_id)
    except WebSocketDisconnect:
        browser_event_hub.disconnect(call_id, websocket)
    finally:
        db.close()
