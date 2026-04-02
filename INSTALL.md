# Installation & Setup

This guide walks through everything needed to run Call Maze Solver locally: dependencies, credentials, environment configuration, and starting the development servers.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.11+ | 3.12 works too |
| conda / mamba | any | used to manage the Python env |
| Node.js | 18+ | 20 LTS recommended |
| npm | 9+ | bundled with Node |
| ngrok (or equivalent) | any | exposes the local backend to Telnyx webhooks |

---

## 1. Clone the repository

```bash
git clone <repo-url>
cd call_maze_solver
```

---

## 2. Obtain credentials

You need credentials from two external services: **Telnyx** (telephony) and **Google AI Studio** (LLM).

### 2.1 Telnyx

Telnyx provides the outbound calling infrastructure, webhooks, and the WebRTC softphone.

**Create a free account**

Go to [telnyx.com](https://telnyx.com) and create an account. You will get a small credit to test calls.

**API key**

1. Open the Telnyx Mission Control Portal → **Auth** → **API Keys**
2. Click **Create API Key**
3. Copy the key — this is `TELNYX_API_KEY` (starts with `KEY…`)

**Webhook public key**

1. Same page → **Public Key** tab
2. Copy the public key string — this is `TELNYX_PUBLIC_KEY`
   (used to verify webhook signatures)

**Buy or port a phone number**

1. Go to **Numbers** → **Buy Numbers**
2. Search for a number with Voice capability
3. Purchase it — this is `TELNYX_PHONE_NUMBER` (E.164 format, e.g. `+34910000000`)

**Create a Call Control application**

1. Go to **Voice** → **Call Control** → **Applications**
2. Click **Create Application**
3. Set the **Webhook URL** to `https://<your-public-url>/webhooks/telnyx/voice`
   (you will update this once ngrok is running — see step 5)
4. Set **Webhook API Version** to **API v2**
5. Save — copy the **Connection ID** (UUID format) — this is `TELNYX_CONNECTION_ID`
6. Assign your purchased phone number to this application

**SIP credentials for the browser softphone**

The browser softphone authenticates via SIP credentials.

1. Go to **Voice** → **SIP Trunking** → **Credentials**
2. Click **Create SIP Credential**
3. Set a username (e.g. `operator-browser`) and a strong password
4. These become `TELNYX_SIP_USERNAME` and `TELNYX_SIP_PASSWORD`
5. `TELNYX_SIP_DOMAIN` is always `sip.telnyx.com`

**Voice profiles (optional)**

The default voices are AWS Polly via Telnyx:

- `TELNYX_VOICE_EN_US=AWS.Polly.Joanna-Neural`
- `TELNYX_VOICE_ES_ES=AWS.Polly.Lucia-Neural`

You can browse available voices in the Telnyx docs under **Text-to-Speech**.

---

### 2.2 Google AI Studio (Gemini)

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with a Google account
3. Click **Get API key** → **Create API key**
4. Copy the key — this is `API_KEY_AI_STUDIO`

The default model is `gemini-2.5-flash` (fast and cost-efficient). You can change it in `.env` with `LLM_MODEL`.

---

## 3. Configure environment variables

Copy the example file and fill in the values you obtained above:

```bash
cp .env.example .env
```

Open `.env` and populate each field:

```env
# ── Application ──────────────────────────────────────────────
APP_ENV=development
APP_HOST=0.0.0.0
APP_PORT=8000
FRONTEND_URL=http://localhost:5173

# Set this to your ngrok URL once it's running (step 5)
PUBLIC_BASE_URL=https://your-ngrok-subdomain.ngrok-free.app

# ── Database ─────────────────────────────────────────────────
DATABASE_URL=sqlite:///./data/app.db

# ── Telnyx ───────────────────────────────────────────────────
TELNYX_API_KEY=KEYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELNYX_PUBLIC_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELNYX_CONNECTION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
TELNYX_PHONE_NUMBER=+34xxxxxxxxx
TELNYX_SIP_USERNAME=operator-browser
TELNYX_SIP_PASSWORD=your-sip-password
TELNYX_SIP_DOMAIN=sip.telnyx.com
TELNYX_VOICE_EN_US=AWS.Polly.Joanna-Neural
TELNYX_VOICE_ES_ES=AWS.Polly.Lucia-Neural

# ── Google Gemini ─────────────────────────────────────────────
API_KEY_AI_STUDIO=your-google-ai-studio-api-key
LLM_MODEL=gemini-2.5-flash

# ── Defaults ─────────────────────────────────────────────────
DEFAULT_UI_LANGUAGE=en
DEFAULT_CALL_LANGUAGE=es-ES
DEFAULT_DISCLOSURE_POLICY=conditional
DEFAULT_RECORDING_ENABLED=true

# ── Storage ───────────────────────────────────────────────────
RECORDING_RETENTION_DAYS=365
RECORDING_MIRROR_DIR=./data/recordings
TRANSCRIPT_EXPORT_DIR=./data/transcripts
```

---

## 4. Install dependencies

### Backend

```bash
conda create -n call python=3.11 -y
conda activate call
cd backend
pip install -e .[dev]
```

### Frontend

```bash
cd frontend
npm install
```

---

## 5. Expose the backend for Telnyx webhooks

Telnyx needs to reach your local backend to deliver call events. Use a tunnel:

```bash
ngrok http 8000
```

ngrok will print a public URL like `https://abc123.ngrok-free.app`. Copy it and:

1. Update `PUBLIC_BASE_URL` in `.env`
2. Update the **Webhook URL** in your Telnyx Call Control application to `https://abc123.ngrok-free.app/webhooks/telnyx/voice`

> You need to redo this each time ngrok restarts (unless you have a paid static domain).

---

## 6. Run database migrations

```bash
conda activate call
cd backend
alembic upgrade head
```

This creates `data/app.db` (SQLite) with the current schema.

---

## 7. Start the development servers

Open two terminals.

**Terminal 1 — Backend**

```bash
conda activate call
cd backend
uvicorn main:app --reload
```

The API is now at `http://localhost:8000`. You can check `http://localhost:8000/health`.

**Terminal 2 — Frontend**

```bash
cd frontend
npm run dev
```

The UI is at `http://localhost:5173`.

---

## 8. Verify everything works

1. Open `http://localhost:5173` in your browser
2. Type a destination number and a task prompt in the **New call** form
3. Click **Start call** — the backend should dial out via Telnyx and you should see events arriving in the **Live events** panel
4. Watch the transcript update in real time

**Run backend tests:**

```bash
conda activate call
cd backend
pytest
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ERR_CONNECTION_REFUSED` on the frontend | Backend not running | Start `uvicorn main:app --reload` |
| Webhook signature error in the backend logs | Wrong `TELNYX_PUBLIC_KEY` | Re-copy the key from the Telnyx portal |
| No events after starting a call | ngrok not running or wrong `PUBLIC_BASE_URL` | Restart ngrok, update `.env` and the Telnyx webhook URL |
| `Call failed` immediately | Wrong `TELNYX_CONNECTION_ID` or phone number not assigned to the application | Check the Telnyx portal |
| Gemini errors | Invalid or missing `API_KEY_AI_STUDIO` | Check the key in Google AI Studio |
| Alembic errors on startup | Migrations not applied | Run `alembic upgrade head` |
