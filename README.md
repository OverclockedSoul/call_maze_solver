# Call Maze Solver

Call Maze Solver is a supervised outbound calling assistant for bureaucratic phone tasks. The operator starts a call from the browser, monitors live status and transcript updates, and can hand the call off to a human browser softphone when needed.

## Stack

- Backend: FastAPI, SQLAlchemy, Alembic, Telnyx Call Control, Google GenAI
- Frontend: React, TypeScript, Vite
- Persistence: SQLite
- Telephony: Telnyx Voice API, Telnyx Call Control webhooks, Telnyx WebRTC

## Local Development

### Backend

```bash
conda create -n call python=3.11 -y
conda activate call
cd backend
pip install -e .[dev]
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Public URL for Telnyx

Use an external tunnel during development and point `PUBLIC_BASE_URL` to it.

```bash
ngrok http 8000
```

## Environment

Copy `.env.example` to `.env` and populate:

- Telnyx API key
- Telnyx Call Control application `connection_id`
- a Telnyx voice-enabled phone number
- Telnyx webhook public signing key
- Telnyx SIP username and SIP password for the browser softphone
- AI Studio API key in `API_KEY_AI_STUDIO`

## Current Scope

- supervised live calls only
- single-operator v1
- English and Spanish UI
- `en-US` and `es-ES` call language profiles
- one-way warm handoff from AI mode to human mode

## Verification

Run backend tests:

```bash
cd backend
pytest
```
