"""initial schema"""

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    call_status = sa.Enum(
        "QUEUED",
        "DIALING",
        "IVR",
        "AGENT_ACTIVE",
        "HANDOFF_REQUESTED",
        "HUMAN_JOINING",
        "HUMAN_ACTIVE",
        "COMPLETED",
        "FAILED",
        name="callstatus",
    )
    disclosure_policy = sa.Enum("ALWAYS", "CONDITIONAL", "NEVER_WITHOUT_REVIEW", name="disclosurepolicy")
    ui_language = sa.Enum("EN", "ES", name="uisupportedlanguage")
    call_language = sa.Enum("EN_US", "ES_ES", name="calllanguage")

    op.create_table(
        "calls",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("destination_number", sa.String(length=32), nullable=False),
        sa.Column("task_prompt", sa.Text(), nullable=False),
        sa.Column("ui_language", ui_language, nullable=False),
        sa.Column("call_language", call_language, nullable=False),
        sa.Column("disclosure_policy", disclosure_policy, nullable=False),
        sa.Column("recording_enabled", sa.Boolean(), nullable=False),
        sa.Column("status", call_status, nullable=False),
        sa.Column("outcome_summary", sa.Text(), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("telnyx_call_control_id", sa.String(length=128), nullable=True),
        sa.Column("telnyx_call_leg_id", sa.String(length=128), nullable=True),
        sa.Column("telnyx_call_session_id", sa.String(length=128), nullable=True),
        sa.Column("telnyx_operator_call_control_id", sa.String(length=128), nullable=True),
        sa.Column("telnyx_operator_call_leg_id", sa.String(length=128), nullable=True),
        sa.Column("telnyx_operator_call_session_id", sa.String(length=128), nullable=True),
    )
    op.create_index("ix_calls_destination_number", "calls", ["destination_number"])

    op.create_table(
        "call_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("call_id", sa.String(length=36), sa.ForeignKey("calls.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
    )
    op.create_index("ix_call_events_call_id", "call_events", ["call_id"])
    op.create_index("ix_call_events_type", "call_events", ["type"])

    op.create_table(
        "transcript_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("call_id", sa.String(length=36), sa.ForeignKey("calls.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("speaker", sa.String(length=32), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("language", sa.String(length=16), nullable=False),
        sa.Column("is_final", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_transcript_entries_call_id", "transcript_entries", ["call_id"])

    op.create_table(
        "recordings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("call_id", sa.String(length=36), sa.ForeignKey("calls.id", ondelete="CASCADE"), nullable=False),
        sa.Column("telnyx_recording_id", sa.String(length=128), nullable=True),
        sa.Column("telnyx_recording_status", sa.String(length=32), nullable=True),
        sa.Column("remote_url", sa.String(length=512), nullable=True),
        sa.Column("local_file_path", sa.String(length=512), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("content_type", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_recordings_call_id", "recordings", ["call_id"])

    op.create_table(
        "operator_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("call_id", sa.String(length=36), sa.ForeignKey("calls.id", ondelete="CASCADE"), nullable=False),
        sa.Column("identity", sa.String(length=128), nullable=False),
        sa.Column("token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("joined_at", sa.DateTime(), nullable=True),
        sa.Column("left_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_operator_sessions_call_id", "operator_sessions", ["call_id"])


def downgrade() -> None:
    op.drop_index("ix_operator_sessions_call_id", table_name="operator_sessions")
    op.drop_table("operator_sessions")
    op.drop_index("ix_recordings_call_id", table_name="recordings")
    op.drop_table("recordings")
    op.drop_index("ix_transcript_entries_call_id", table_name="transcript_entries")
    op.drop_table("transcript_entries")
    op.drop_index("ix_call_events_type", table_name="call_events")
    op.drop_index("ix_call_events_call_id", table_name="call_events")
    op.drop_table("call_events")
    op.drop_index("ix_calls_destination_number", table_name="calls")
    op.drop_table("calls")
