from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.calls import CallDetailResponse, CallResponse, HangupResponse, OperatorSessionEventRequest, StartCallRequest, TakeoverResponse, VoiceTokenResponse
from app.services.call_orchestrator import CallOrchestrator


router = APIRouter(prefix="/api/calls", tags=["calls"])


@router.post("", response_model=CallResponse)
async def start_call(payload: StartCallRequest, db: Session = Depends(get_db)) -> CallResponse:
    orchestrator = CallOrchestrator(db)
    call = await orchestrator.create_call(payload)
    return CallResponse(call_id=call.id, status=call.status)


@router.get("", response_model=list[CallDetailResponse])
def list_calls(db: Session = Depends(get_db)) -> list[CallDetailResponse]:
    orchestrator = CallOrchestrator(db)
    calls = orchestrator.list_calls()
    return [CallDetailResponse.model_validate(call, from_attributes=True) for call in calls]


@router.get("/{call_id}", response_model=CallDetailResponse)
def get_call(call_id: str, db: Session = Depends(get_db)) -> CallDetailResponse:
    orchestrator = CallOrchestrator(db)
    call = orchestrator.get_call(call_id)
    return CallDetailResponse.model_validate(call, from_attributes=True)


@router.post("/{call_id}/takeover", response_model=TakeoverResponse)
async def request_takeover(call_id: str, db: Session = Depends(get_db)) -> TakeoverResponse:
    orchestrator = CallOrchestrator(db)
    call = await orchestrator.request_takeover(call_id)
    return TakeoverResponse(call_id=call.id, status=call.status)


@router.post("/{call_id}/token", response_model=VoiceTokenResponse)
def get_voice_token(call_id: str, db: Session = Depends(get_db)) -> VoiceTokenResponse:
    orchestrator = CallOrchestrator(db)
    token = orchestrator.issue_operator_token(call_id)
    return VoiceTokenResponse(
        token=token.token,
        identity=token.identity,
        sip_uri=token.sip_uri,
        sip_username=token.sip_username,
        sip_password=token.sip_password,
    )


@router.post("/{call_id}/hangup", response_model=HangupResponse)
async def hangup(call_id: str, db: Session = Depends(get_db)) -> HangupResponse:
    orchestrator = CallOrchestrator(db)
    call = await orchestrator.hangup(call_id)
    return HangupResponse(call_id=call.id, status=call.status)


@router.post("/{call_id}/operator-session", response_model=CallResponse)
async def operator_session_event(call_id: str, payload: OperatorSessionEventRequest, db: Session = Depends(get_db)) -> CallResponse:
    orchestrator = CallOrchestrator(db)
    call = await orchestrator.record_operator_activity(call_id, payload.event)
    return CallResponse(call_id=call.id, status=call.status)
