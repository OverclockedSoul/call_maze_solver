# Manual Verification Checklist

## Outbound Call Flow

- Create a call from the browser with a valid E.164 number.
- Verify the API returns a `call_id` and `queued` or `dialing` progression.
- Confirm Telnyx posts voice webhooks to `/webhooks/telnyx/voice`.

## IVR Navigation

- Trigger a menu prompt such as `press 2`.
- Confirm the backend emits `dtmf_sent`.
- Confirm the call moves into `ivr` or remains in a valid state.

## Human Handoff

- Trigger `/api/calls/{id}/takeover`.
- Request a browser token and initialize the Telnyx WebRTC softphone.
- Confirm the frontend posts `ready` and the backend dials the browser SIP URI.
- Answer the incoming browser leg and confirm the backend records `joined`.

## Recording

- Run one call with `recording_enabled=true`.
- Confirm recording metadata is persisted and mirrored locally when Telnyx finalizes audio.
- Run one call with `recording_enabled=false`.
- Confirm no local mirrored recording file is created.

## Compliance

- Run calls with `always`, `conditional`, and `never_without_review`.
- Confirm the selected policy is visible in persisted call data and reflected in the operator-facing UI.
