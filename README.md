# Call Maze Solver

<img src="logos/logo_dark.png" alt="Call Maze Solver" width="320" />

Call Maze Solver is a supervised outbound calling assistant for bureaucratic phone tasks. The operator starts a call from the browser, monitors live status and transcript updates, and can hand the call off to a human browser softphone when needed.

---

## What it does

Navigating government phone trees, insurance hold queues, and utility call centers is slow, unpredictable work. Call Maze Solver delegates that work to an AI agent while keeping a human in the loop at every step.

The operator:

1. Types a destination number and a plain-English task description
2. Watches the live transcript as the AI speaks, listens, and navigates the IVR
3. Can request a warm handoff at any point — the browser softphone connects to the same call leg so the operator can take over seamlessly

---

## Key features

| Feature | Detail |
|---|---|
| **AI-driven outbound calls** | Google Gemini handles turn-taking, IVR navigation, and task completion |
| **Live transcript** | Every utterance streams to the browser in real time over WebSocket |
| **Human handoff** | One-click warm handoff via Telnyx WebRTC browser softphone |
| **Browser agent sandbox** | Chat with the AI in the browser (no telephony needed) to refine prompts before going live |
| **Bilingual** | English and Spanish UI and call-language profiles (`en-US`, `es-ES`) |
| **Call history** | Full event log, transcript, recording status and outcome summary per call |
| **Recording support** | Calls can be recorded and mirrored to local storage |

---

## Architecture

```
┌─────────────────────────────────┐
│           Browser               │
│  React + Tailwind + Telnyx RTC  │
└────────────┬────────────────────┘
             │ HTTP / WebSocket
┌────────────▼────────────────────┐
│         FastAPI backend         │
│  SQLAlchemy · Alembic · SQLite  │
└──────────┬──────────────────────┘
           │
    ┌──────┴──────┐
    │             │
┌───▼───┐   ┌────▼─────┐
│Telnyx │   │  Gemini  │
│Voice  │   │   LLM    │
│ API   │   │          │
└───────┘   └──────────┘
```

**Backend** — FastAPI application with a SQLite database (swap-ready for Postgres). Telnyx Call Control webhooks drive the call state machine. An Alembic migration keeps the schema versioned.

**Frontend** — React 18 + TypeScript + Vite, styled with Tailwind CSS. Real-time updates via a WebSocket connection per selected call. WebRTC softphone powered by the Telnyx SDK.

**AI layer** — Google Gemini (default: `gemini-2.5-flash`) generates agent turns, IVR decisions, and the browser-only sandbox replies.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, Manrope + Fraunces fonts |
| State / data | TanStack Query, React Hook Form, Zod |
| Backend framework | FastAPI, Pydantic v2 |
| ORM / migrations | SQLAlchemy, Alembic |
| Database | SQLite (file-based, zero-config) |
| Telephony | Telnyx Call Control, Telnyx WebRTC |
| AI | Google Gemini via `google-genai` SDK |
| Realtime | WebSocket (native browser + FastAPI) |
| i18n | i18next (EN / ES) |

---

## Current scope

- Supervised live outbound calls only (no inbound)
- Single-operator v1 — one browser session at a time
- English and Spanish language profiles
- One-way warm handoff (AI → human); human-to-AI re-handoff is not yet supported
- SQLite by default; no multi-tenant data isolation

---

## Project structure

```
call_maze_solver/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # calls, agent, telnyx webhook
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/         # call orchestrator, browser events
│   │   ├── integrations/     # Telnyx, Google Gemini
│   │   └── repositories/     # data access layer
│   └── alembic/              # database migrations
├── frontend/
│   └── src/
│       ├── components/       # StatusBadge, CallList, CallForm, CallDetail, …
│       ├── services/         # typed API client
│       ├── locales/          # en.json, es.json
│       └── App.tsx           # shell + routing
├── data/                     # SQLite db, recordings, transcripts (git-ignored)
├── logos/
└── .env.example
```

---

## Setup & development

See [INSTALL.md](INSTALL.md) for full instructions including how to obtain Telnyx and Gemini credentials.
