from __future__ import annotations

from pydantic import BaseModel, Field


class BrowserAgentMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class BrowserAgentRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[BrowserAgentMessage] = []
    task_prompt: str | None = Field(default=None, max_length=4000)


class BrowserAgentResponse(BaseModel):
    reply: str
