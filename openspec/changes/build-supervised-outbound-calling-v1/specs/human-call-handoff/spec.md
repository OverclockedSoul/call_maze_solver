## ADDED Requirements

### Requirement: System supports AI-requested and operator-requested handoff
The system SHALL allow human handoff to be requested either by backend AI reasoning or directly by the operator. Handoff requests MUST only be accepted while the call is in `ivr` or `agent_active`.

#### Scenario: AI requests takeover
- **WHEN** the reasoning layer determines a human is required
- **THEN** the backend transitions the call to `handoff_requested`
- **THEN** the backend emits a handoff request event to the browser with the reason

#### Scenario: Operator requests takeover
- **WHEN** the operator invokes the takeover endpoint during an eligible live call
- **THEN** the backend transitions the call to `handoff_requested`
- **THEN** the backend begins the handoff flow

### Requirement: System performs one-way warm handoff through Telnyx WebRTC and bridged call legs
The system SHALL issue a Telnyx WebRTC login token for the browser, wait for the softphone to report readiness, dial the operator SIP URI as a second Telnyx leg, and bridge that leg to the live PSTN leg. The AI MUST NOT resume control for that call afterward.

#### Scenario: Successful warm handoff
- **WHEN** a handoff request is accepted
- **THEN** the operator browser receives join credentials
- **THEN** the backend dials the operator SIP leg after the browser softphone reports ready
- **THEN** Telnyx bridges the operator leg to the live PSTN leg
- **THEN** the call transitions through `human_joining` to `human_active` when the operator joins

#### Scenario: Handoff join times out
- **WHEN** the browser softphone is prepared but the operator fails to answer within the configured timeout
- **THEN** the backend records the handoff timeout event
- **THEN** the call remains in a recoverable human-join state or fails according to configured timeout policy

### Requirement: System issues short-lived browser join credentials
The system SHALL issue a short-lived Telnyx WebRTC login token and SIP target information for the operator to join a handoff from the browser. The token endpoint MUST only return credentials for calls already in handoff flow.

#### Scenario: Valid token request during handoff
- **WHEN** the operator requests a browser join token for a call in `handoff_requested` or `human_joining`
- **THEN** the backend returns a short-lived login token, operator identity, and SIP URI metadata

#### Scenario: Token request outside handoff flow
- **WHEN** the operator requests a browser join token for a call not in handoff flow
- **THEN** the backend rejects the request
- **THEN** no browser join credentials are issued

### Requirement: System records operator participation in handoff sessions
The system SHALL persist operator join lifecycle data for every browser-based handoff. Ready, join, leave, and join failure outcomes MUST be recorded as durable events.

#### Scenario: Operator joins and leaves the bridged call
- **WHEN** the operator successfully answers and later leaves a handoff call
- **THEN** the backend records the readiness, join, and leave timestamps
- **THEN** the call event stream contains the participation events
