## Context

CallMazeSolver is a supervised outbound-calling app for handling bureaucratic phone tasks while keeping a human operator in the loop. The original change set was written around a different provider’s relay-style primitives, but the selected provider is now Telnyx. Telnyx does not offer the same high-level relay abstraction, so the architecture needs to shift from provider-managed conversational sessions to backend-owned orchestration over Telnyx Call Control webhooks and commands.

The backend remains the source of truth for call lifecycle and policy enforcement. Telnyx handles PSTN calling, DTMF delivery, speech playback, transcription, recording, and leg bridging. The operator remains present in the browser and can take over through a Telnyx WebRTC softphone registered with a Telnyx telephony credential.

## Goals / Non-Goals

**Goals:**
- Provide an implementation-ready architecture for supervised outbound calling on Telnyx.
- Persist call state, transcripts, events, and recording metadata durably.
- Support a one-way warm handoff from AI-driven call flow to a browser-based human operator.
- Expose stable REST and WebSocket contracts for the frontend.
- Support English and Spanish UI plus per-call voice language profiles.
- Make disclosure and recording behavior explicit product policies rather than hidden prompt conventions.

**Non-Goals:**
- Multi-tenant SaaS support, billing, and account management.
- Fully unattended background calling.
- Returning control to the AI after a human joins the call.
- Kubernetes, queues, event buses, or horizontal orchestration in v1.
- Regulated workflows that require PCI or healthcare compliance guarantees.

## Decisions

### 1. Use Telnyx Call Control as the primary live-call interface

The backend will create outbound calls with Telnyx, receive webhook events for call lifecycle and transcription, and send call commands such as `speak`, `send_dtmf`, `record_start`, `transcription_start`, `bridge`, and `hangup`.

Rationale:
- Aligns the implementation with the chosen provider.
- Keeps telephony-time control in provider-native primitives rather than raw audio transport.
- Supports IVR navigation, speech playback, recording, and bridge control from the backend.

Alternatives considered:
- Keeping the previous provider design and swapping later: rejected because the provider-specific contracts are central to the runtime behavior.
- Building custom SIP or RTP plumbing first: rejected because it expands the media surface and slows down v1.

### 2. Use a text model for reasoning, not a live audio model

The reasoning layer receives transcript windows, policies, and state, then returns tool intents such as speaking text, sending digits, ending the call, or requesting human takeover.

Rationale:
- Telnyx handles telephony-time voice I/O while the backend validates every action.
- A text reasoning loop is easier to test, log, replay, and refine.
- It keeps the model surface narrow and provider-agnostic.

### 3. Persist operational state in SQLite from day one

Calls, events, transcript entries, recordings, and operator session data are stored in SQLite with Alembic migrations.

Rationale:
- In-memory-only state is unacceptable for supervised calls.
- SQLite keeps v1 simple while allowing a later migration to Postgres.
- The system needs a durable timeline for debugging, replay, and auditability.

### 4. Model human takeover as a one-way warm handoff through Telnyx WebRTC

When AI escalation is needed, the browser registers a Telnyx WebRTC softphone with a short-lived login token, the backend dials the operator SIP URI as a second Telnyx leg, and Telnyx bridges the operator leg to the live PSTN leg once the browser answers.

Rationale:
- Cleanly separates AI mode from human mode.
- Avoids direct browser audio transport through the backend.
- Matches Telnyx’s native browser and SIP model.

### 5. Treat disclosure, recording, and language as explicit per-call policy inputs

The backend stores and enforces `disclosure_policy`, `recording_enabled`, `ui_language`, and `call_language` on every call.

Rationale:
- These values change runtime behavior and must be traceable.
- Policy cannot be hidden inside prompts if the UI and backend need to reflect it consistently.
- Language separation between UI and telephony voice is required for English/Spanish support.

### 6. Keep the backend authoritative even when the browser disconnects

The browser is a live monitor and control surface, but the call lifecycle continues if the browser reloads or drops.

Rationale:
- Supervisory UX cannot be allowed to own call survival.
- This is necessary for reliable telephony behavior and consistent state recovery.

## Risks / Trade-offs

- [Webhook payload drift or provider mismatch] -> Validate event schemas defensively and record unknown events durably for inspection.
- [Repeated transcription windows cause repeated AI actions] -> Only react to final transcript entries and keep action validation in the backend.
- [Operator handoff fails because the browser is not registered yet] -> Separate token issuance from operator readiness, then dial the browser SIP leg only after the softphone reports ready.
- [SQLite write contention during live events] -> Keep transactions short and isolate write-heavy event logging from core state transitions.
- [Recording download or mirror fails after Telnyx finalization] -> Keep remote recording metadata even if mirroring fails and expose retriable backfill behavior.
- [Policy ambiguity across jurisdictions] -> Treat disclosure/compliance settings as operator-configured controls and document that legal review remains external to the app.

## Migration Plan

1. Replace legacy provider-specific fields, dependencies, and routes with Telnyx equivalents.
2. Implement outbound call creation and Telnyx webhook handling before human handoff.
3. Add browser supervision, call history, and policy display once live call flow is stable.
4. Add Telnyx WebRTC handoff and operator SIP bridging after the AI-managed flow works end to end.
5. Validate policy, language, and failure scenarios before treating the change as implementation-complete.

Rollback strategy:
- During development, revert to the previous change state by discarding implementation commits, not by mixing providers.
- In deployment, disable call creation and handoff endpoints if Telnyx integration is unstable while preserving read access to persisted history.

## Open Questions

- Which Gemini model variant will be used for production reasoning once the current API key is validated.
- Whether mirrored recording files should be encrypted at rest in v1 or deferred to the first production hardening pass.
- Whether operator authentication remains single-user local auth or becomes a lightweight protected session before first deployment.
