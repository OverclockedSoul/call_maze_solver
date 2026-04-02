## ADDED Requirements

### Requirement: System persists call history durably
The system SHALL persist call records, transcript entries, call events, recording metadata, and operator join sessions in durable storage. This data MUST remain available after browser disconnects or backend restarts.

#### Scenario: Call data survives browser disconnect
- **WHEN** the operator browser disconnects during a live call
- **THEN** the backend continues persisting call state and events
- **THEN** the operator can later retrieve the call history from the API

#### Scenario: Completed call history is requested
- **WHEN** the operator requests a previously completed call
- **THEN** the backend returns the stored metadata, transcript, outcome summary, and recording metadata for that call

### Requirement: System streams live monitoring updates to the browser
The system SHALL provide a WebSocket feed for live call monitoring. The backend MUST emit browser-safe updates for status changes, transcript entries, DTMF actions, handoff requests, failures, and recording availability.

#### Scenario: Transcript update during a live call
- **WHEN** a new final transcript entry is produced by Telnyx transcription
- **THEN** the backend persists the transcript entry
- **THEN** the backend emits a transcript event on the call WebSocket

#### Scenario: Failure during a live call
- **WHEN** a live call encounters a Telnyx or application error
- **THEN** the backend emits an error-safe event to the browser
- **THEN** the browser receives the current call status and failure context needed for supervision

### Requirement: System exposes recent call history for the dashboard
The system SHALL provide an API that lists recent calls for operator review. Each listed call MUST include enough summary data for the dashboard to show status, destination, timestamps, and recording availability.

#### Scenario: Operator opens the dashboard
- **WHEN** the operator requests the call list
- **THEN** the backend returns recent calls ordered by newest activity
- **THEN** each list item contains status and monitoring summary fields

### Requirement: System tracks recording metadata independently from mirrored files
The system SHALL store recording metadata for every call and SHALL retain Telnyx recording identifiers even if local recording mirroring fails. Local file paths MUST only be populated when mirrored audio is successfully retrieved.

#### Scenario: Recording mirror succeeds
- **WHEN** Telnyx finalizes a recording and the backend downloads it successfully
- **THEN** the recording metadata stores both the Telnyx recording identifier and local file path

#### Scenario: Recording mirror fails
- **WHEN** Telnyx finalizes a recording but the backend cannot download or store the file
- **THEN** the recording metadata still stores the Telnyx recording identifier and remote status
- **THEN** the failure is recorded as a call event
