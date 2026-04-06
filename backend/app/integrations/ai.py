from __future__ import annotations

from dataclasses import dataclass
from contextlib import asynccontextmanager
from typing import Any
from typing import TYPE_CHECKING

from google import genai
from google.genai import types

from app.core.settings import Settings
from app.models.enums import DisclosurePolicy

if TYPE_CHECKING:
    from app.models import Call


@dataclass
class ToolIntent:
    name: str
    arguments: dict


class AIOrchestrator:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client: genai.Client | None = None

    def decide_next_action(self, call: "Call", prompt_text: str) -> ToolIntent:
        lowered = prompt_text.lower()

        if "pulse" in lowered or "press" in lowered:
            digit = next((char for char in prompt_text if char.isdigit()), None)
            if digit:
                return ToolIntent("send_digits", {"digits": digit})

        if any(word in lowered for word in ["human", "representative", "agente", "persona"]):
            return ToolIntent("request_human_takeover", {"reason": "Remote party requires human intervention"})

        if any(word in lowered for word in ["bye", "goodbye", "adios", "adiós"]):
            return ToolIntent("end_call", {})

        prefix = ""
        if call.disclosure_policy == DisclosurePolicy.ALWAYS:
            prefix = "Hello, this is an automated assistant calling on behalf of a customer. "
        elif call.disclosure_policy == DisclosurePolicy.CONDITIONAL:
            prefix = "Hello. "

        return ToolIntent("speak_text", {"text": f"{prefix}{call.task_prompt.strip()}"})

    async def browser_agent_reply(
        self,
        *,
        message: str,
        history: list[dict[str, str]],
        task_prompt: str | None,
    ) -> str:
        if not self.settings.ai_studio_api_key:
            raise RuntimeError("API_KEY_AI_STUDIO is required for Gemini Live browser chat.")

        async with self.open_browser_live_session(
            history=history,
            task_prompt=task_prompt,
        ) as session:
            await session.send_realtime_input(text=message)
            await session.send_realtime_input(activity_end=types.ActivityEnd())
            return await self._collect_live_text(session)

    @asynccontextmanager
    async def open_browser_live_session(
        self,
        *,
        history: list[dict[str, str]],
        task_prompt: str | None,
    ):
        if not self.settings.ai_studio_api_key:
            raise RuntimeError("API_KEY_AI_STUDIO is required for Gemini Live browser chat.")

        client = self._get_client()
        async with client.aio.live.connect(
            model=self._model_name(),
            config=self.browser_live_config(
                history=history,
                task_prompt=task_prompt,
            ),
        ) as session:
            if history:
                await session.send_client_content(
                    turns=self._history_to_turns(history),
                    turn_complete=False,
                )
            yield session

    def browser_live_config(
        self,
        *,
        history: list[dict[str, str]],
        task_prompt: str | None,
    ) -> types.LiveConnectConfig:
        return types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            history_config=types.HistoryConfig(initial_history_in_client_content=bool(history)),
            system_instruction=self._browser_live_prompt(task_prompt),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=self._configured_voice_name()
                    )
                )
            ),
            temperature=0.4,
        )

    def _browser_live_prompt(self, task_prompt: str | None) -> str | None:
        prompt = (task_prompt or "").strip()
        return prompt or None

    def _get_client(self) -> genai.Client:
        if self._client is None:
            self._client = genai.Client(api_key=self.settings.ai_studio_api_key)
        return self._client

    def _model_name(self) -> str:
        model = self.settings.llm_model.strip()
        return model.removeprefix("models/")

    def _configured_voice_name(self) -> str:
        return self.settings.gemini_voice_name

    def _history_to_turns(self, history: list[dict[str, str]]) -> list[types.Content]:
        turns: list[types.Content] = []
        for item in history[-12:]:
            role = "model" if item.get("role") == "assistant" else "user"
            content = item.get("content", "").strip()
            if not content:
                continue
            turns.append(types.Content(role=role, parts=[types.Part(text=content)]))
        return turns

    async def _collect_live_text(self, session: Any) -> str:
        fragments: list[str] = []
        async for message in session.receive():
            server_content = getattr(message, "server_content", None)
            output_transcription = getattr(server_content, "output_transcription", None)
            if output_transcription and output_transcription.text:
                fragments.append(output_transcription.text)
            if server_content and server_content.turn_complete:
                break

        reply = "".join(fragments).strip()
        if not reply:
            raise RuntimeError("Gemini Live returned an empty reply.")
        return reply
