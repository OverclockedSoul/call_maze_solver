export type StartCallPayload = {
  destination_number: string;
  task_prompt: string;
  ui_language: "en" | "es";
  call_language: "en-US" | "es-ES";
  disclosure_policy: "always" | "conditional" | "never_without_review";
  recording_enabled: boolean;
};

export type TranscriptEntry = {
  created_at: string;
  speaker: string;
  text: string;
  source: string;
  language: string;
  is_final: boolean;
};

export type BrowserAgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CallDetail = {
  id: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  ended_at: string | null;
  destination_number: string;
  task_prompt: string;
  ui_language: "en" | "es";
  call_language: "en-US" | "es-ES";
  disclosure_policy: "always" | "conditional" | "never_without_review";
  recording_enabled: boolean;
  status: string;
  outcome_summary: string | null;
  failure_reason: string | null;
  telnyx_call_control_id: string | null;
  telnyx_call_leg_id: string | null;
  telnyx_call_session_id: string | null;
  telnyx_operator_call_control_id: string | null;
  telnyx_operator_call_leg_id: string | null;
  telnyx_operator_call_session_id: string | null;
  transcript_entries: TranscriptEntry[];
  events: Array<{ created_at: string; type: string; payload_json: Record<string, unknown> }>;
  recordings: Array<{ local_file_path: string | null; telnyx_recording_status: string | null }>;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  `${window.location.protocol}//${window.location.hostname}:8000`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const payload = await response.json();
      if (typeof payload?.detail === "string") {
        detail = payload.detail;
      }
    } catch {
    }
    throw new Error(detail);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const api = {
  listCalls: () => request<CallDetail[]>("/api/calls"),
  browserAgentReply: (payload: {
    message: string;
    history: BrowserAgentMessage[];
    ui_language: "en" | "es";
    call_language: "en-US" | "es-ES";
    disclosure_policy: "always" | "conditional" | "never_without_review";
    task_prompt?: string;
  }) =>
    request<{ reply: string }>("/api/agent/browser-chat", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startCall: (payload: StartCallPayload) =>
    request<{ call_id: string; status: string }>("/api/calls", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  takeover: (callId: string) => request(`/api/calls/${callId}/takeover`, { method: "POST" }),
  hangup: (callId: string) => request(`/api/calls/${callId}/hangup`, { method: "POST" }),
  getVoiceToken: (callId: string) =>
    request<{ token: string | null; identity: string; sip_uri: string; sip_username?: string | null; sip_password?: string | null }>(`/api/calls/${callId}/token`, {
      method: "POST",
    }),
  operatorSessionEvent: (callId: string, event: "ready" | "joined" | "left") =>
    request(`/api/calls/${callId}/operator-session`, {
      method: "POST",
      body: JSON.stringify({ event }),
    }),
  createCallSocket: (callId: string) =>
    new WebSocket(`${API_BASE_URL.replace(/^http/, "ws")}/ws/calls/${callId}`),
};
