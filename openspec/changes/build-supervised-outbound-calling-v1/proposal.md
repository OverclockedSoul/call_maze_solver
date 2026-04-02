## Why

CallMazeSolver currently has a v1 implementation path, but it was designed around legacy provider-specific primitives that no longer match the selected provider. This change keeps the supervised outbound-calling product scope intact while standardizing the implementation on Telnyx Call Control and Telnyx WebRTC so the code, specs, and operator workflow describe one coherent telephony stack.

## What Changes

- Standardize the telephony stack on Telnyx outbound calling, Call Control webhooks and commands, and Telnyx WebRTC for browser takeover.
- Preserve the FastAPI, React, and SQLite architecture while replacing legacy provider contracts and data fields.
- Define browser-facing APIs and WebSocket events for creating calls, monitoring progress, requesting takeover, preparing the browser softphone, and terminating calls.
- Keep first-class policy controls for disclosure, recording, and bilingual operation across English and Spanish.
- Remove legacy provider-only concepts such as relay sessions, conference names, and browser token formats that do not apply to Telnyx.

## Capabilities

### New Capabilities
- `outbound-call-orchestration`: Start and manage supervised outbound PSTN calls with explicit state transitions and backend-owned orchestration.
- `call-monitoring-and-history`: Persist call records, transcripts, events, and recording metadata and stream live monitoring updates to the browser.
- `human-call-handoff`: Escalate a live AI-driven call into a browser-based operator session using Telnyx WebRTC and an operator SIP leg bridged through Call Control.
- `call-policy-and-localization`: Apply per-call disclosure, recording, and language policies and expose localized operator-facing behavior.

### Modified Capabilities
- None.

## Impact

- Affects backend architecture, data model, API surface, Telnyx integration strategy, frontend state management, and deployment assumptions.
- Introduces new dependencies including PyNaCl for webhook validation and Telnyx WebRTC for the browser softphone.
- Establishes the base contracts that future implementation and archive phases will build on.
