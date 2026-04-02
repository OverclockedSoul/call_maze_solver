import { useEffect, useMemo, useRef, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { TelnyxRTC } from "@telnyx/webrtc";

import "./lib/i18n";
import { api, type BrowserAgentMessage, type CallDetail, type StartCallPayload } from "./services/api";
import { AgentChat } from "./components/AgentChat";
import { CallDetail as CallDetailPanel } from "./components/CallDetail";
import { CallForm } from "./components/CallForm";
import { CallList } from "./components/CallList";
import { EmptyState } from "./components/EmptyState";
import { Panel } from "./components/Panel";
import { TranscriptPanel } from "./components/TranscriptPanel";

const queryClient = new QueryClient();

const callSchema = z.object({
  destination_number: z.string().min(8),
  task_prompt: z.string().min(5),
  ui_language: z.enum(["en", "es"]),
  call_language: z.enum(["en-US", "es-ES"]),
  disclosure_policy: z.enum(["always", "conditional", "never_without_review"]),
  recording_enabled: z.boolean(),
});

type CallFormValues = z.infer<typeof callSchema>;

function Shell() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [liveEvents, setLiveEvents] = useState<Record<string, unknown>[]>([]);
  const [device, setDevice] = useState<TelnyxRTC | null>(null);
  const [softphoneReady, setSoftphoneReady] = useState(false);
  const [browserMessages, setBrowserMessages] = useState<BrowserAgentMessage[]>([]);
  const [browserInput, setBrowserInput] = useState("");
  const [listening, setListening] = useState(false);
  const [startCallError, setStartCallError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const form = useForm<CallFormValues>({
    resolver: zodResolver(callSchema),
    defaultValues: {
      destination_number: "+34910000000",
      task_prompt: "",
      ui_language: i18n.language === "es" ? "es" : "en",
      call_language: "es-ES",
      disclosure_policy: "conditional",
      recording_enabled: true,
    },
  });

  const callsQuery = useQuery({
    queryKey: ["calls"],
    queryFn: api.listCalls,
    refetchInterval: 5000,
  });

  const selectedCall = useMemo(
    () => callsQuery.data?.find((item) => item.id === selectedCallId) ?? null,
    [callsQuery.data, selectedCallId]
  );

  useEffect(() => {
    if (!selectedCallId) return;
    const ws = api.createCallSocket(selectedCallId);
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data) as Record<string, unknown>;
      setLiveEvents((current) => [payload, ...current].slice(0, 50));
      void qc.invalidateQueries({ queryKey: ["calls"] });
    };
    return () => ws.close();
  }, [selectedCallId, qc]);

  useEffect(() => {
    return () => {
      device?.disconnect();
      recognitionRef.current?.stop();
      window.speechSynthesis.cancel();
    };
  }, [device]);

  const startCallMutation = useMutation({
    mutationFn: (payload: StartCallPayload) => api.startCall(payload),
    onSuccess: (result) => {
      setSelectedCallId(result.call_id);
      setShowForm(false);
      setLiveEvents([]);
      setStartCallError(null);
      void qc.invalidateQueries({ queryKey: ["calls"] });
    },
    onError: (err) => {
      setStartCallError(err instanceof Error ? err.message : t("startCallError"));
    },
  });

  const takeoverMutation = useMutation({
    mutationFn: (callId: string) => api.takeover(callId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["calls"] }),
  });

  const hangupMutation = useMutation({
    mutationFn: (callId: string) => api.hangup(callId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["calls"] }),
  });

  const browserAgentMutation = useMutation({
    mutationFn: (message: string) =>
      api.browserAgentReply({
        message,
        history: browserMessages,
        ui_language: form.getValues("ui_language"),
        call_language: form.getValues("call_language"),
        disclosure_policy: form.getValues("disclosure_policy"),
        task_prompt: form.getValues("task_prompt"),
      }),
    onSuccess: (result, message) => {
      const nextMessages: BrowserAgentMessage[] = [
        ...browserMessages,
        { role: "user", content: message },
        { role: "assistant", content: result.reply },
      ];
      setBrowserMessages(nextMessages);
      speakReply(result.reply, form.getValues("call_language"));
    },
  });

  const joinCall = async (callId: string) => {
    device?.disconnect();
    setSoftphoneReady(false);
    const token = await api.getVoiceToken(callId);
    const telnyxConfig = token.token
      ? { login_token: token.token }
      : { login: token.sip_username ?? "", password: token.sip_password ?? "" };
    const client = new TelnyxRTC(telnyxConfig as never);
    if (remoteAudioRef.current) client.remoteElement = remoteAudioRef.current;

    let leftReported = false;
    const reportLeft = () => {
      if (leftReported) return;
      leftReported = true;
      void api.operatorSessionEvent(callId, "left");
    };

    client.on("telnyx.ready", () => {
      setSoftphoneReady(true);
      void api.operatorSessionEvent(callId, "ready");
    });

    client.on("telnyx.notification", async (notification: { call?: any }) => {
      const incomingCall = notification?.call;
      if (!incomingCall) return;
      await incomingCall.answer();
      await api.operatorSessionEvent(callId, "joined");
      if (typeof incomingCall.on === "function") {
        incomingCall.on("hangup", reportLeft);
        incomingCall.on("destroy", reportLeft);
      }
    });

    client.on("telnyx.error", reportLeft);
    client.connect();
    setDevice(client);
  };

  const submitBrowserMessage = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || browserAgentMutation.isPending) return;
    setBrowserInput("");
    browserAgentMutation.mutate(trimmed);
  };

  const toggleListening = () => {
    const RecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!RecognitionCtor) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new RecognitionCtor();
    recognition.lang = form.getValues("call_language");
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      setBrowserInput(transcript);
      if (transcript) submitBrowserMessage(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const handleSelectCall = (id: string | null) => {
    setSelectedCallId(id);
    if (id) setShowForm(false);
  };

  const handleNewCall = () => {
    setSelectedCallId(null);
    setShowForm(true);
    setStartCallError(null);
  };

  const onSubmit = form.handleSubmit((values) => {
    startCallMutation.mutate(values);
  });

  const calls = callsQuery.data ?? [];
  const completedCount = calls.filter((call) => call.status.toLowerCase() === "completed").length;
  const activeCount = calls.filter((call) =>
    ["dialing", "ivr", "agent_active", "handoff_requested", "human_joining", "human_active"].includes(
      call.status.toLowerCase()
    )
  ).length;
  const failedCount = calls.filter((call) => call.status.toLowerCase() === "failed").length;

  return (
    <div className="min-h-screen bg-parchment-50 text-ink-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <header className="shell-panel overflow-hidden">
          <div className="grid gap-8 px-6 py-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.9fr)] lg:px-8 lg:py-8">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-black/10 bg-white text-sm font-semibold shadow-card">
                  CMS
                </span>
                <div className="space-y-1">
                  <p className="eyebrow">{t("heroEyebrow")}</p>
                  <h1 className="font-display text-4xl leading-none text-ink-950 sm:text-5xl">
                    {t("heroTitle")}
                  </h1>
                </div>
              </div>
              <p className="max-w-3xl text-base leading-8 text-ink-700 sm:text-lg">
                {t("heroDescription")}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleNewCall}
                  className="inline-flex items-center justify-center rounded-full bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-900"
                >
                  {t("newCall")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = i18n.language === "en" ? "es" : "en";
                    void i18n.changeLanguage(next);
                    form.setValue("ui_language", next as "en" | "es");
                  }}
                  className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink-900 transition hover:border-black/20 hover:bg-white/85"
                  aria-label={t("switchLanguage")}
                >
                  {i18n.language === "en" ? "ES" : "EN"}
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <MetricCard label={t("metricTotalCalls")} value={calls.length.toString()} tone="neutral" />
              <MetricCard label={t("metricActiveCalls")} value={activeCount.toString()} tone="accent" />
              <MetricCard label={t("metricCompletedCalls")} value={completedCount.toString()} tone="success" />
            </div>
          </div>

          <div className="grid gap-3 border-t border-black/5 bg-white/40 px-6 py-4 text-sm text-ink-700 lg:grid-cols-[1fr_auto_auto] lg:items-center lg:px-8">
            <p>{t("heroFooter")}</p>
            <InlineStatus
              active={softphoneReady}
              label={softphoneReady ? t("softphoneReadyShort") : t("softphoneDisconnected")}
            />
            <InlineStatus
              active={failedCount === 0}
              label={failedCount === 0 ? t("workspaceHealthy") : t("workspaceNeedsAttention")}
            />
          </div>
        </header>

        <main className="mt-4 grid flex-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          <div className="min-h-[320px] xl:min-h-0">
            <CallList
              calls={calls}
              selectedCallId={!showForm ? selectedCallId : null}
              isLoading={callsQuery.isLoading}
              isError={callsQuery.isError}
              onSelect={handleSelectCall}
              onNewCall={handleNewCall}
            />
          </div>

          <div className="grid gap-4">
            {showForm || !selectedCall ? (
              <FormProvider {...form}>
                <CallForm
                  onSubmit={onSubmit}
                  isPending={startCallMutation.isPending}
                  error={startCallError}
                />
              </FormProvider>
            ) : (
              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
                <CallDetailPanel
                  call={selectedCall}
                  events={liveEvents}
                  softphoneReady={softphoneReady}
                  isTakingOver={takeoverMutation.isPending}
                  isHangingUp={hangupMutation.isPending}
                  isJoining={false}
                  onTakeover={() => takeoverMutation.mutate(selectedCall.id)}
                  onHangup={() => hangupMutation.mutate(selectedCall.id)}
                  onJoin={() => void joinCall(selectedCall.id)}
                />
                <TranscriptPanel call={selectedCall} />
              </div>
            )}

            {!showForm && !selectedCall ? (
              <Panel className="p-6">
                <EmptyState
                  title={t("selectCallTitle")}
                  description={t("selectCallHint")}
                  icon={<CompassIcon />}
                  className="min-h-[260px]"
                />
              </Panel>
            ) : null}
          </div>

          <div className="min-h-[360px] xl:min-h-0">
            <AgentChat
              messages={browserMessages}
              inputValue={browserInput}
              listening={listening}
              pending={browserAgentMutation.isPending}
              onInputChange={setBrowserInput}
              onSend={() => submitBrowserMessage(browserInput)}
              onToggleListening={toggleListening}
            />
          </div>
        </main>
      </div>

      <audio ref={remoteAudioRef} autoPlay playsInline />
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "accent" | "success";
}) {
  const toneClass = {
    neutral: "bg-white/90",
    accent: "bg-[#f2efe6]",
    success: "bg-[#edf3ed]",
  }[tone];

  return (
    <div className={`shell-subpanel px-5 py-4 ${toneClass}`}>
      <p className="eyebrow mb-3">{label}</p>
      <p className="font-display text-4xl leading-none text-ink-950">{value}</p>
    </div>
  );
}

function InlineStatus({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] ${
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-black/10 bg-white/80 text-ink-600"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-500" : "bg-ink-400"}`} />
      {label}
    </span>
  );
}

function CompassIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function speakReply(text: string, language: "en-US" | "es-ES") {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  window.speechSynthesis.speak(utterance);
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  );
}
