from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.agent import BrowserAgentRequest, BrowserAgentResponse
from app.services.call_orchestrator import CallOrchestrator


router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.post("/browser-chat", response_model=BrowserAgentResponse)
def browser_chat(payload: BrowserAgentRequest, db: Session = Depends(get_db)) -> BrowserAgentResponse:
    orchestrator = CallOrchestrator(db)
    reply = orchestrator.ai.browser_agent_reply(
        message=payload.message,
        history=[item.model_dump() for item in payload.history],
        ui_language=payload.ui_language,
        call_language=payload.call_language,
        disclosure_policy=payload.disclosure_policy,
        task_prompt=payload.task_prompt,
    )
    return BrowserAgentResponse(reply=reply)
