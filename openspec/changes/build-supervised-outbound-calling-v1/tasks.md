## 1. Foundation

- [x] 1.1 Create the backend and frontend project structure described in the change design.
- [x] 1.2 Add backend dependencies for FastAPI, SQLAlchemy, Alembic, Telnyx, google-genai, configuration, and structured logging.
- [x] 1.3 Add frontend dependencies for React, form validation, server-state management, i18n, and Telnyx WebRTC.
- [x] 1.4 Normalize environment variable names, create `.env.example`, and document required Telnyx and model configuration.

## 2. Persistence and Core Domain

- [x] 2.1 Define SQLAlchemy models for calls, call events, transcript entries, recordings, and operator sessions.
- [x] 2.2 Create the initial Alembic migration for the v1 database schema.
- [x] 2.3 Implement repositories or service-layer helpers for loading and updating call state durably.
- [x] 2.4 Implement state transition guards for the call lifecycle and rejected transition logging.

## 3. Outbound Calling and Orchestration

- [x] 3.1 Implement `POST /api/calls`, `GET /api/calls`, `GET /api/calls/{id}`, and `POST /api/calls/{id}/hangup`.
- [x] 3.2 Implement Telnyx outbound call creation and webhook handling with verified Call Control events.
- [x] 3.3 Implement transcription persistence, recording persistence, and browser event publishing from Telnyx webhooks.
- [x] 3.4 Implement the reasoning loop that converts transcript/state windows into validated Telnyx call commands.

## 4. Monitoring, Policy, and Localization

- [x] 4.1 Implement `WS /ws/calls/{id}` for live browser-safe status, transcript, DTMF, handoff, and recording events.
- [x] 4.2 Implement per-call policy handling for disclosure and recording across API validation, persistence, and reasoning context.
- [x] 4.3 Implement English and Spanish UI localization plus `en-US` and `es-ES` call-language profile handling.
- [x] 4.4 Implement dashboard and detail views for recent calls, call history, and persisted transcript/recording metadata.

## 5. Human Handoff

- [x] 5.1 Implement `POST /api/calls/{id}/takeover` and the backend handoff workflow that transitions a live Telnyx call into operator-join flow.
- [x] 5.2 Implement the Telnyx operator SIP leg dialing and bridge workflow for the live PSTN leg.
- [x] 5.3 Implement `POST /api/calls/{id}/token` and short-lived Telnyx WebRTC login token generation.
- [x] 5.4 Implement frontend browser join flow with Telnyx WebRTC and operator participation tracking.

## 6. Recording, Validation, and Hardening

- [x] 6.1 Implement Telnyx recording metadata persistence and finalized recording mirroring to local storage.
- [x] 6.2 Add automated tests for API validation, state transitions, webhook handling, and repository behavior.
- [x] 6.3 Add integration or manual verification coverage for outbound calls, IVR navigation, human handoff, and recording retrieval.
- [ ] 6.4 Validate disclosure-enabled, disclosure-disabled, recording-enabled, and recording-disabled scenarios before implementation signoff.
