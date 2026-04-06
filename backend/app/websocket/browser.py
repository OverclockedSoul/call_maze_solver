import base64

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.genai import types

from app.core.settings import get_settings
from app.db.session import SessionLocal
from app.integrations.ai import AIOrchestrator
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


@router.websocket("/ws/browser-live")
async def browser_live_socket(websocket: WebSocket) -> None:
    await websocket.accept()

    try:
        start_payload = await websocket.receive_json()
        if start_payload.get("type") != "start":
            await websocket.send_json({"type": "error", "detail": "Expected browser live start payload."})
            await websocket.close()
            return

        settings = get_settings()
        orchestrator = AIOrchestrator(settings)
        history = start_payload.get("history") or []
        task_prompt = (start_payload.get("task_prompt") or "").strip()
        if not task_prompt:
            await websocket.send_json({"type": "error", "detail": "Browser live start payload requires task_prompt."})
            await websocket.close()
            return

        async with orchestrator.open_browser_live_session(
            history=history,
            task_prompt=task_prompt,
        ) as session:
            await websocket.send_json({"type": "ready"})
            while True:
                payload = await websocket.receive_json()
                message_type = payload.get("type")

                if message_type == "audio_chunk":
                    chunk = base64.b64decode(payload["data"])
                    sample_rate = int(payload.get("sample_rate", 24000))
                    await session.send_realtime_input(
                        audio=types.Blob(
                            data=chunk,
                            mime_type=f"audio/pcm;rate={sample_rate}",
                        )
                    )
                    continue

                if message_type == "end_turn":
                    await session.send_realtime_input(audio_stream_end=True)
                    user_text: list[str] = []
                    assistant_text: list[str] = []
                    async for response in session.receive():
                        server_content = response.server_content
                        if server_content and server_content.model_turn:
                            for part in server_content.model_turn.parts or []:
                                inline_data = getattr(part, "inline_data", None)
                                if inline_data and inline_data.data:
                                    await websocket.send_json(
                                        {
                                            "type": "audio_chunk",
                                            "data": base64.b64encode(inline_data.data).decode("ascii"),
                                            "mime_type": inline_data.mime_type,
                                        }
                                    )
                        if server_content and server_content.input_transcription and server_content.input_transcription.text:
                            user_text.append(server_content.input_transcription.text)
                        if server_content and server_content.output_transcription and server_content.output_transcription.text:
                            assistant_text.append(server_content.output_transcription.text)
                        if server_content and server_content.turn_complete:
                            break

                    await websocket.send_json(
                        {
                            "type": "turn_complete",
                            "user_text": "".join(user_text).strip(),
                            "assistant_text": "".join(assistant_text).strip(),
                        }
                    )
                    continue

                if message_type == "stop":
                    await websocket.close()
                    return

                await websocket.send_json({"type": "error", "detail": f"Unsupported browser live message: {message_type}"})
    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "detail": str(exc)})
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass
