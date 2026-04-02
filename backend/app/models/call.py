import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import CallLanguage, CallStatus, DisclosurePolicy, UISupportedLanguage


class Call(Base):
    __tablename__ = "calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    destination_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    task_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    ui_language: Mapped[UISupportedLanguage] = mapped_column(Enum(UISupportedLanguage), nullable=False)
    call_language: Mapped[CallLanguage] = mapped_column(Enum(CallLanguage), nullable=False)
    disclosure_policy: Mapped[DisclosurePolicy] = mapped_column(Enum(DisclosurePolicy), nullable=False)
    recording_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[CallStatus] = mapped_column(Enum(CallStatus), nullable=False, default=CallStatus.QUEUED)
    outcome_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    telnyx_call_control_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    telnyx_call_leg_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    telnyx_call_session_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    telnyx_operator_call_control_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    telnyx_operator_call_leg_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    telnyx_operator_call_session_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    events = relationship("CallEvent", back_populates="call", cascade="all, delete-orphan")
    transcript_entries = relationship("TranscriptEntry", back_populates="call", cascade="all, delete-orphan")
    recordings = relationship("Recording", back_populates="call", cascade="all, delete-orphan")
    operator_sessions = relationship("OperatorSession", back_populates="call", cascade="all, delete-orphan")
