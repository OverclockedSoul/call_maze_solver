from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.enums import CallLanguage, DisclosurePolicy, UISupportedLanguage


class BrowserAgentMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class BrowserAgentRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[BrowserAgentMessage] = []
    ui_language: UISupportedLanguage = UISupportedLanguage.ES
    call_language: CallLanguage = CallLanguage.ES_ES
    disclosure_policy: DisclosurePolicy = DisclosurePolicy.CONDITIONAL
    task_prompt: str | None = Field(default=None, max_length=4000)


class BrowserAgentResponse(BaseModel):
    reply: str
