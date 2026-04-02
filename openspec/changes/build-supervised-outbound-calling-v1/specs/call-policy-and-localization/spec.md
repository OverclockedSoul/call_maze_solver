## ADDED Requirements

### Requirement: System stores and enforces per-call policy controls
The system SHALL store `disclosure_policy` and `recording_enabled` as per-call settings. The backend MUST apply these values consistently in prompt construction, call behavior, persisted metadata, and operator-visible status.

#### Scenario: Call is created with recording enabled
- **WHEN** the operator starts a call with recording enabled
- **THEN** the backend persists that policy on the call
- **THEN** the recording workflow is enabled for that call

#### Scenario: Call is created with recording disabled
- **WHEN** the operator starts a call with recording disabled
- **THEN** the backend persists that policy on the call
- **THEN** no local mirrored audio file is created for that call
- **THEN** transcript and recording metadata behavior still follow system rules

### Requirement: System supports separate UI and call language settings
The system SHALL distinguish between UI language and call language. The UI language MUST control operator-facing labels and messages, while the call language MUST control telephony configuration, prompts, and call-side summaries.

#### Scenario: UI and call languages differ
- **WHEN** the operator chooses `en` for UI language and `es-ES` for call language
- **THEN** the browser UI remains in English
- **THEN** the call flow uses Spanish call-side language settings

#### Scenario: Unsupported call language is requested
- **WHEN** the operator submits a call language profile not configured for the system
- **THEN** the backend rejects the request
- **THEN** the call is not created

### Requirement: System localizes operator-facing summaries and control surfaces
The system SHALL provide localized operator-facing labels, validation text, call statuses, and handoff controls for English and Spanish. The UI MUST render current language changes without altering persisted call history.

#### Scenario: Operator switches UI language
- **WHEN** the operator changes the UI language between English and Spanish
- **THEN** the browser updates operator-facing interface text to the selected language
- **THEN** previously stored call records remain unchanged

### Requirement: System exposes disclosure policy as an operator-visible workflow control
The system SHALL expose disclosure policy as an explicit operator-visible control and SHALL NOT rely on undocumented prompt-only behavior. Calls using restricted disclosure modes MUST remain auditable through persisted policy values.

#### Scenario: Conditional disclosure policy is selected
- **WHEN** the operator starts a call with `conditional` disclosure policy
- **THEN** the backend persists the selected policy
- **THEN** the reasoning context includes that policy value for the call

#### Scenario: Restricted disclosure mode requires review
- **WHEN** the operator selects `never_without_review`
- **THEN** the system records that explicit policy choice with the call
- **THEN** operator-visible workflow data reflects that the call used a reviewed restricted mode
