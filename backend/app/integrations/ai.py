from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.core.settings import Settings
from app.models import Call
from app.models.enums import CallLanguage, DisclosurePolicy, UISupportedLanguage


@dataclass
class ToolIntent:
    name: str
    arguments: dict


class AIOrchestrator:
    def __init__(self, settings: Settings):
        self.settings = settings

    def decide_next_action(self, call: Call, prompt_text: str) -> ToolIntent:
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

    def browser_agent_reply(
        self,
        *,
        message: str,
        history: list[dict[str, str]],
        ui_language: UISupportedLanguage,
        call_language: CallLanguage,
        disclosure_policy: DisclosurePolicy,
        task_prompt: str | None,
    ) -> str:
        api_key = self.settings.ai_studio_api_key
        if api_key:
            reply = self._gemini_browser_reply(
                api_key=api_key,
                message=message,
                history=history,
                ui_language=ui_language,
                call_language=call_language,
                disclosure_policy=disclosure_policy,
                task_prompt=task_prompt,
            )
            if reply:
                return reply
        return self._fallback_browser_reply(
            message=message,
            ui_language=ui_language,
            call_language=call_language,
            disclosure_policy=disclosure_policy,
            task_prompt=task_prompt,
        )

    def _gemini_browser_reply(
        self,
        *,
        api_key: str,
        message: str,
        history: list[dict[str, str]],
        ui_language: UISupportedLanguage,
        call_language: CallLanguage,
        disclosure_policy: DisclosurePolicy,
        task_prompt: str | None,
    ) -> str | None:
        language_hint = "Spanish" if call_language == CallLanguage.ES_ES else "English"
        disclosure_hint = {
            DisclosurePolicy.ALWAYS: "Always disclose you are an automated assistant when relevant.",
            DisclosurePolicy.CONDITIONAL: "Disclose automation only when directly asked or when clarity is needed.",
            DisclosurePolicy.NEVER_WITHOUT_REVIEW: "Avoid disclosure claims and stay neutral because this mode requires review.",
        }[disclosure_policy]
        system_text = (
            "You are a browser-only preview of a phone assistant for bureaucratic calls. "
            f"Reply in {language_hint}. Be concise, polite, and professional. "
            f"{disclosure_hint} "
            "Do not mention telephony limitations unless asked. "
            "If the user is roleplaying as a company representative, answer as the assistant would during a call."
        )
        if task_prompt:
            system_text += f" Current task context: {task_prompt.strip()}"

        contents: list[dict[str, Any]] = []
        for item in history[-8:]:
            role = "model" if item.get("role") == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": item.get("content", "")}]})
        contents.append({"role": "user", "parts": [{"text": message}]})

        payload = {
            "system_instruction": {"parts": [{"text": system_text}]},
            "contents": contents,
            "generationConfig": {"temperature": 0.5, "maxOutputTokens": 250},
        }
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.settings.llm_model}:generateContent?key={api_key}"
        try:
            response = httpx.post(url, json=payload, timeout=30.0)
            response.raise_for_status()
            data = response.json()
            candidates = data.get("candidates") or []
            if not candidates:
                return None
            parts = candidates[0].get("content", {}).get("parts") or []
            text_parts = [part.get("text", "") for part in parts if isinstance(part, dict)]
            reply = "\n".join(part for part in text_parts if part).strip()
            return reply or None
        except Exception:
            return None

    def _fallback_browser_reply(
        self,
        *,
        message: str,
        ui_language: UISupportedLanguage,
        call_language: CallLanguage,
        disclosure_policy: DisclosurePolicy,
        task_prompt: str | None,
    ) -> str:
        lowered = message.lower()
        is_spanish = call_language == CallLanguage.ES_ES or ui_language == UISupportedLanguage.ES
        if any(word in lowered for word in ["human", "agent", "persona", "agente", "representative"]):
            return (
                "Puedo transferirte a una persona cuando la integracion telefonica este activa."
                if is_spanish
                else "I can hand the call to a human once the telephony flow is active."
            )
        if any(word in lowered for word in ["summary", "resumen", "what are you doing", "que haces"]):
            context = task_prompt or ("simulating a bureaucratic call assistant" if not is_spanish else "simulando un asistente para llamadas burocraticas")
            return (
                f"Estoy practicando esta tarea: {context}."
                if is_spanish
                else f"I'm practicing this task: {context}."
            )

        prefix = ""
        if disclosure_policy == DisclosurePolicy.ALWAYS:
            prefix = (
                "Soy un asistente automatizado. "
                if is_spanish
                else "I am an automated assistant. "
            )
        elif disclosure_policy == DisclosurePolicy.CONDITIONAL:
            prefix = "Claro. " if is_spanish else "Understood. "

        if task_prompt:
            return (
                f"{prefix}Puedo ayudarte a ensayar la conversacion para: {task_prompt}. Respondo a tu ultimo mensaje asi: {message}"
                if is_spanish
                else f"{prefix}I can help you rehearse the conversation for: {task_prompt}. My response to your last message is: {message}"
            )
        return (
            f"{prefix}Puedes seguir hablando y respondere como un agente de prueba en el navegador."
            if is_spanish
            else f"{prefix}You can keep talking and I will respond as a browser-only test agent."
        )
