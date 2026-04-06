from __future__ import annotations

import asyncio
import base64
from pathlib import Path

from google import genai
from google.genai import types

from app.core.settings import get_settings


FIXTURE_TEXT = "Hola, soy Laura Martin Perez con NIF 53124578Z y llamo por el incidente B5341."


async def main() -> None:
    settings = get_settings()
    if not settings.ai_studio_api_key:
        raise RuntimeError("API_KEY_AI_STUDIO is required.")

    output_path = Path(__file__).resolve().parents[1] / "data" / "dev-runtime" / "browser-live-smoke-input.b64"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    client = genai.Client(api_key=settings.ai_studio_api_key)
    async with client.aio.live.connect(
        model=settings.llm_model.removeprefix("models/"),
        config=types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            output_audio_transcription=types.AudioTranscriptionConfig(),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=settings.gemini_voice_name)
                )
            ),
            system_instruction="Di exactamente el texto del usuario y nada mas.",
        ),
    ) as session:
        await session.send_realtime_input(text=FIXTURE_TEXT)
        await session.send_realtime_input(activity_end=types.ActivityEnd())
        audio_chunks: list[bytes] = []
        async for message in session.receive():
            server_content = message.server_content
            if server_content and server_content.model_turn:
                for part in server_content.model_turn.parts or []:
                    inline_data = getattr(part, "inline_data", None)
                    if inline_data and inline_data.data:
                        audio_chunks.append(inline_data.data)
            if server_content and server_content.turn_complete:
                break

    output_path.write_text(base64.b64encode(b"".join(audio_chunks)).decode("ascii"), encoding="utf-8")
    print(output_path)


if __name__ == "__main__":
    asyncio.run(main())
