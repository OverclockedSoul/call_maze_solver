from __future__ import annotations

import asyncio
import json
import re
import unicodedata
import wave
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types

from app.core.settings import Settings


AXA_AGENT_PROMPT = """Eres un agente humano de AXA Espana especializado en siniestros.
Hablas por telefono con tono cercano, profesional y realista.
Reglas:
- En tu primer turno debes saludar brevemente, presentarte como AXA y pedir nombre completo y NIF.
- No des informacion del expediente hasta haber oido nombre completo y NIF.
- Si aun no has oido nombre completo y NIF, insiste en pedirlos y no hagas otra cosa.
- Cuando ya hayas oido nombre completo y NIF, informas sobre el incidente B5341.
- El dato obligatorio es este: la indemnizacion ya se tramito y aparecera en la cuenta bancaria en dos dias laborables.
- Despues de comunicar ese dato, si la cliente agradece y se despide, cierras la llamada con una despedida breve.
- No inventes importes, coberturas ni pasos extra.
- Habla como una persona real en una llamada breve.
- No te salgas de este flujo."""


CUSTOMER_AI_PROMPT = """Eres una asistente IA conversacional que llama en nombre de una cliente.
Hablas por telefono en espanol de Espana con tono educado, natural y resolutivo.
Datos fijos:
- Nombre: Laura Martin Perez
- NIF: 53124578Z
- Consulta: incidente B5341
Reglas:
- Si AXA te pide identificarte, respondes con nombre completo, NIF y que llamas por el incidente B5341.
- Si todavia no te han dado la resolucion del incidente B5341, no te despidas.
- Cuando AXA confirme que la indemnizacion ya se tramito y llegara en dos dias laborables, agradeces la informacion y cierras la llamada.
- No metas relleno ni explicaciones artificiales.
- Habla como una interlocutora real en una llamada breve.
- No te salgas de este flujo."""


SCENARIO_DIRNAME = "axa-b5341-gemini-live-test"


@dataclass
class ConversationTurn:
    speaker_code: str
    display_name: str
    utterance: str
    audio_bytes: bytes
    mime_type: str
    input_audio_text: str = ""


@dataclass
class SimulationArtifacts:
    output_dir: Path
    transcript_path: Path
    audio_path: Path
    prompts_path: Path
    metadata_path: Path
    model: str


class GeminiConversationTestkit:
    def __init__(self, settings: Settings):
        if not settings.ai_studio_api_key:
            raise ValueError("API_KEY_AI_STUDIO is required for Gemini Live simulation.")
        self.settings = settings
        self.client = genai.Client(api_key=settings.ai_studio_api_key)

    def generate_axa_claim_simulation(self, output_root: Path) -> SimulationArtifacts:
        return asyncio.run(self._generate_axa_claim_simulation(output_root))

    async def _generate_axa_claim_simulation(self, output_root: Path) -> SimulationArtifacts:
        output_dir = output_root / SCENARIO_DIRNAME
        output_dir.mkdir(parents=True, exist_ok=True)

        turns = await self._run_live_conversation()
        turns = await self._finalize_transcripts(turns)

        transcript_path = output_dir / "transcript.txt"
        audio_path = output_dir / "conversation.wav"
        prompts_path = output_dir / "prompts.md"
        metadata_path = output_dir / "metadata.json"

        self._write_prompts(prompts_path)
        self._write_transcript(transcript_path, turns)
        await self._write_audio(audio_path, turns)
        self._write_metadata(metadata_path)

        return SimulationArtifacts(
            output_dir=output_dir,
            transcript_path=transcript_path,
            audio_path=audio_path,
            prompts_path=prompts_path,
            metadata_path=metadata_path,
            model=self._model_name(),
        )

    async def _run_live_conversation(self) -> list[ConversationTurn]:
        async with self.client.aio.live.connect(
            model=self._model_name(),
            config=self._live_audio_config(AXA_AGENT_PROMPT),
        ) as axa_session, self.client.aio.live.connect(
            model=self._model_name(),
            config=self._live_audio_config(CUSTOMER_AI_PROMPT),
        ) as customer_session:
            turns: list[ConversationTurn] = []

            axa_opening = await self._session_reply_from_text(
                axa_session,
                "Empieza la llamada ahora. Recuerda: en este primer turno debes presentarte como AXA y pedir nombre completo y NIF.",
                speaker_code="AXA_AGENT",
                display_name="Agente AXA",
            )
            turns.append(axa_opening)
            current_turn = axa_opening
            next_is_customer = True

            for _ in range(8):
                if self._conversation_complete(turns):
                    break
                if next_is_customer:
                    current_turn = await self._session_reply_from_audio(
                        customer_session,
                        current_turn.audio_bytes,
                        current_turn.mime_type,
                        speaker_code="IA_CLIENTE",
                        display_name="IA cliente",
                    )
                else:
                    current_turn = await self._session_reply_from_audio(
                        axa_session,
                        current_turn.audio_bytes,
                        current_turn.mime_type,
                        speaker_code="AXA_AGENT",
                        display_name="Agente AXA",
                    )
                previous_turn = turns[-1]
                if current_turn.input_audio_text and len(self._normalize_text(current_turn.input_audio_text)) > len(self._normalize_text(previous_turn.utterance)):
                    previous_turn.utterance = current_turn.input_audio_text
                turns.append(current_turn)
                next_is_customer = not next_is_customer

        return turns

    def _conversation_complete(self, turns: list[ConversationTurn]) -> bool:
        transcript = self._normalize_text(" ".join(turn.utterance for turn in turns))
        return (
            "laura martin perez" in transcript
            and "53124578z" in transcript
            and "b5341" in transcript
            and "indemniz" in transcript
            and "dias laborables" in transcript
            and "gracias" in transcript
            and any(word in transcript for word in ["adios", "un saludo", "hasta luego", "que tenga un buen dia", "que tenga buen dia"])
        )

    def _live_audio_config(self, system_instruction: str) -> types.LiveConnectConfig:
        return types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            output_audio_transcription=types.AudioTranscriptionConfig(),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            system_instruction=system_instruction,
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=self.settings.gemini_voice_name)
                )
            ),
            temperature=0.35,
        )

    async def _session_reply_from_text(
        self,
        session: Any,
        prompt: str,
        *,
        speaker_code: str,
        display_name: str,
    ) -> ConversationTurn:
        await session.send_realtime_input(text=prompt)
        await session.send_realtime_input(activity_end=types.ActivityEnd())
        return await self._collect_audio_turn(session, speaker_code=speaker_code, display_name=display_name)

    async def _session_reply_from_audio(
        self,
        session: Any,
        audio_bytes: bytes,
        mime_type: str,
        *,
        speaker_code: str,
        display_name: str,
    ) -> ConversationTurn:
        await session.send_realtime_input(audio=types.Blob(data=audio_bytes, mime_type=mime_type))
        await session.send_realtime_input(audio_stream_end=True)
        return await self._collect_audio_turn(session, speaker_code=speaker_code, display_name=display_name)

    async def _collect_audio_turn(
        self,
        session: Any,
        *,
        speaker_code: str,
        display_name: str,
    ) -> ConversationTurn:
        async def _inner() -> ConversationTurn:
            audio_chunks: list[bytes] = []
            transcript_chunks: list[str] = []
            input_chunks: list[str] = []
            mime_type = "audio/pcm;rate=24000"
            async for message in session.receive():
                server_content = getattr(message, "server_content", None)
                model_turn = getattr(server_content, "model_turn", None)
                if model_turn:
                    for part in model_turn.parts or []:
                        inline_data = getattr(part, "inline_data", None)
                        if inline_data and inline_data.data:
                            audio_chunks.append(inline_data.data)
                            mime_type = inline_data.mime_type or mime_type
                output_transcription = getattr(server_content, "output_transcription", None)
                if output_transcription and output_transcription.text:
                    transcript_chunks.append(output_transcription.text)
                input_transcription = getattr(server_content, "input_transcription", None)
                if input_transcription and input_transcription.text:
                    input_chunks.append(input_transcription.text)
                if server_content and server_content.turn_complete:
                    break
            reply = re.sub(r"\s+", " ", "".join(transcript_chunks)).strip()
            if not reply or not audio_chunks:
                raise RuntimeError("Gemini Live returned an empty conversation turn.")
            return ConversationTurn(
                speaker_code=speaker_code,
                display_name=display_name,
                utterance=reply,
                audio_bytes=b"".join(audio_chunks),
                mime_type=mime_type,
                input_audio_text=re.sub(r"\s+", " ", "".join(input_chunks)).strip(),
            )

        return await asyncio.wait_for(_inner(), timeout=60.0)

    async def _finalize_transcripts(self, turns: list[ConversationTurn]) -> list[ConversationTurn]:
        if not turns:
            return turns
        turns[-1].utterance = await self._transcribe_audio(turns[-1].audio_bytes, turns[-1].mime_type)
        for turn in turns[:-1]:
            if len(self._normalize_text(turn.utterance)) < 24:
                turn.utterance = await self._transcribe_audio(turn.audio_bytes, turn.mime_type)
        return turns

    async def _transcribe_audio(self, audio_bytes: bytes, mime_type: str) -> str:
        async with self.client.aio.live.connect(
            model=self._model_name(),
            config=types.LiveConnectConfig(
                response_modalities=["AUDIO"],
                input_audio_transcription=types.AudioTranscriptionConfig(),
                system_instruction="Transcribe con precision el audio en espanol de Espana. No resumas ni reformules.",
            ),
        ) as session:
            await session.send_realtime_input(audio=types.Blob(data=audio_bytes, mime_type=mime_type))
            await session.send_realtime_input(audio_stream_end=True)

            async def _inner() -> str:
                chunks: list[str] = []
                async for message in session.receive():
                    server_content = getattr(message, "server_content", None)
                    input_transcription = getattr(server_content, "input_transcription", None)
                    if input_transcription and input_transcription.text:
                        chunks.append(input_transcription.text)
                    if server_content and server_content.turn_complete:
                        break
                text = re.sub(r"\s+", " ", "".join(chunks)).strip()
                if not text:
                    raise RuntimeError("Gemini Live did not return input audio transcription.")
                return text

            return await asyncio.wait_for(_inner(), timeout=45.0)

    async def _write_audio(self, audio_path: Path, turns: list[ConversationTurn]) -> None:
        pcm_chunks: list[bytes] = []
        sample_rate = 24_000

        for turn in turns:
            sample_rate = self._sample_rate_from_mime_type(turn.mime_type)
            pcm_chunks.append(turn.audio_bytes)

        with wave.open(str(audio_path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(b"".join(pcm_chunks))

    def _sample_rate_from_mime_type(self, mime_type: str | None) -> int:
        if not mime_type:
            return 24_000
        match = re.search(r"rate=(\d+)", mime_type)
        return int(match.group(1)) if match else 24_000

    def _write_prompts(self, prompts_path: Path) -> None:
        prompts_path.write_text(
            "\n".join(
                [
                    "# Prompts de simulacion AXA B5341",
                    "",
                    f"- Modelo Gemini Live: `{self._model_name()}`",
                    "- Transporte: `bidiGenerateContent`",
                    "- Conversacion entre agentes: `audio in -> audio out`",
                    "- La transcripcion solo se usa para guardar artefactos, no para conducir la conversacion",
                    "",
                    "## Prompt AXA",
                    "",
                    AXA_AGENT_PROMPT,
                    "",
                    "## Prompt IA cliente",
                    "",
                    CUSTOMER_AI_PROMPT,
                    "",
                ]
            ),
            encoding="utf-8",
        )

    def _write_transcript(self, transcript_path: Path, turns: list[ConversationTurn]) -> None:
        transcript_path.write_text(
            "\n".join(f"{turn.display_name}: {turn.utterance}" for turn in turns),
            encoding="utf-8",
        )

    def _write_metadata(self, metadata_path: Path) -> None:
        payload: dict[str, Any] = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "model": self._model_name(),
            "transport": "bidiGenerateContent",
            "conversation_mode": "audio_to_audio",
            "transcript_source": "next_turn_input_transcription_plus_last_turn_post_pass",
        }
        metadata_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _model_name(self) -> str:
        model = self.settings.llm_model.strip()
        return model.removeprefix("models/")

    def _normalize_text(self, value: str) -> str:
        normalized = unicodedata.normalize("NFKD", value)
        without_accents = "".join(char for char in normalized if not unicodedata.combining(char))
        return re.sub(r"\s+", " ", without_accents).lower()
