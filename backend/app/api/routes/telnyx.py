from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.call_orchestrator import CallOrchestrator


router = APIRouter(prefix="/webhooks/telnyx", tags=["telnyx"])


@router.post("/voice")
async def telnyx_voice_webhook(request: Request, db: Session = Depends(get_db)) -> dict[str, bool]:
    raw_body = await request.body()
    orchestrator = CallOrchestrator(db)

    signature = request.headers.get("telnyx-signature-ed25519")
    timestamp = request.headers.get("telnyx-timestamp")
    if not orchestrator.telnyx.validate_webhook_signature(raw_body, signature, timestamp):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

    event = await request.json()
    await orchestrator.handle_telnyx_event(event)
    return {"received": True}
