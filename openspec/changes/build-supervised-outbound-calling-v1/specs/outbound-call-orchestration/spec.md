## ADDED Requirements

### Requirement: System can create supervised outbound calls
The system SHALL allow the operator to create an outbound call by submitting a destination number, task prompt, UI language, call language, disclosure policy, and recording preference. The backend MUST validate the request, persist the call record, and initiate the Telnyx outbound call.

#### Scenario: Valid outbound call request
- **WHEN** the operator submits a valid call creation request
- **THEN** the backend stores a new call record with status `queued`
- **THEN** the backend requests an outbound PSTN call from Telnyx
- **THEN** the API returns the created call identifier and initial status

#### Scenario: Invalid outbound call request
- **WHEN** the operator submits a malformed phone number or unsupported policy or language value
- **THEN** the backend rejects the request
- **THEN** no outbound call is created
- **THEN** the operator receives a validation error

### Requirement: System enforces the outbound call state machine
The system SHALL manage each call through explicit statuses `queued`, `dialing`, `ivr`, `agent_active`, `handoff_requested`, `human_joining`, `human_active`, `completed`, and `failed`. The backend MUST reject invalid transitions and record transition attempts as call events.

#### Scenario: Call progresses through valid states
- **WHEN** Telnyx and operator actions arrive in an allowed order
- **THEN** the backend updates the call status to the next valid state
- **THEN** the transition is persisted as a call event

#### Scenario: Invalid transition is attempted
- **WHEN** the system receives an action that would move a call into a disallowed state
- **THEN** the backend preserves the prior valid state
- **THEN** the backend records the rejected transition attempt

### Requirement: System drives Telnyx call actions from validated tool intents
The system SHALL translate backend-approved tool intents into Telnyx Call Control commands. The backend MUST validate each generated action before sending speech, DTMF, bridge, or hangup commands to Telnyx.

#### Scenario: IVR choice is clear
- **WHEN** the reasoning layer returns a `send_digits` intent with valid digits
- **THEN** the backend sends a Telnyx DTMF command for those digits
- **THEN** the backend records the DTMF action as a call event

#### Scenario: Generated tool intent is invalid
- **WHEN** the reasoning layer returns an unsupported action or malformed parameters
- **THEN** the backend refuses to send the action to Telnyx
- **THEN** the backend records the invalid tool intent as an error event

### Requirement: System can terminate live outbound calls
The system SHALL allow the operator or backend policy to end a live call. The backend MUST terminate the Telnyx call legs and persist the final call state.

#### Scenario: Operator hangs up an AI-managed call
- **WHEN** the operator requests hangup while the call is in AI-managed mode
- **THEN** the backend terminates the live Telnyx call
- **THEN** the call transitions to `completed` unless Telnyx reports a platform failure

#### Scenario: Call fails before completion
- **WHEN** the carrier or Telnyx reports busy, no-answer, or transport failure
- **THEN** the backend transitions the call to `failed`
- **THEN** the failure reason is persisted on the call record
