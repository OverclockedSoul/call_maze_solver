import { useEffect, useMemo, useRef, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { TelnyxRTC } from "@telnyx/webrtc";

import "./lib/i18n";
import { CallDetail as CallDetailPanel } from "./components/CallDetail";
import { CallList } from "./components/CallList";
import { EmptyState } from "./components/EmptyState";
import { Panel } from "./components/Panel";
import { TranscriptPanel } from "./components/TranscriptPanel";
import {
  api,
  type BrowserAgentMessage,
  type CallDetail,
  type StartCallPayload,
} from "./services/api";

const queryClient = new QueryClient();
const BROWSER_LIVE_STORAGE_KEY = "call-maze-browser-live";
type AppRoute = "/" | "/history" | "/browser-live";
type UiLanguage = "en" | "es";
type CallLanguage = "en-US" | "es-ES";

function normalizeRoute(pathname: string): AppRoute {
  if (pathname === "/history") return "/history";
  if (pathname === "/browser-live") return "/browser-live";
  return "/";
}

function readBrowserLiveDraft(): { task_prompt: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(BROWSER_LIVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { task_prompt?: string };
    if (typeof parsed.task_prompt !== "string") return null;
    return { task_prompt: parsed.task_prompt };
  } catch {
    return null;
  }
}

function writeBrowserLiveDraft(taskPrompt: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    BROWSER_LIVE_STORAGE_KEY,
    JSON.stringify({ task_prompt: taskPrompt }),
  );
}

function Shell() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [route, setRoute] = useState<AppRoute>(() => normalizeRoute(window.location.pathname));
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [destinationNumber, setDestinationNumber] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<Record<string, unknown>[]>([]);
  const [device, setDevice] = useState<TelnyxRTC | null>(null);
  const [softphoneReady, setSoftphoneReady] = useState(false);

  const uiLanguage: UiLanguage = i18n.language === "en" ? "en" : "es";
  const callLanguage: CallLanguage = uiLanguage === "en" ? "en-US" : "es-ES";

  useEffect(() => {
    const handlePopState = () => setRoute(normalizeRoute(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    return () => {
      device?.disconnect();
      window.speechSynthesis.cancel();
    };
  }, [device]);

  const navigate = (nextRoute: AppRoute) => {
    if (window.location.pathname !== nextRoute) {
      window.history.pushState({}, "", nextRoute);
    }
    setRoute(nextRoute);
  };

  const callsQuery = useQuery({
    queryKey: ["calls"],
    queryFn: api.listCalls,
    refetchInterval: route === "/history" ? 5000 : false,
    enabled: route === "/history",
  });

  const selectedCall = useMemo(
    () => callsQuery.data?.find((item) => item.id === selectedCallId) ?? null,
    [callsQuery.data, selectedCallId],
  );

  useEffect(() => {
    if (route !== "/history") return;
    if (!callsQuery.data?.length) return;
    if (selectedCallId && callsQuery.data.some((call) => call.id === selectedCallId)) return;
    setSelectedCallId(callsQuery.data[0].id);
  }, [callsQuery.data, route, selectedCallId]);

  useEffect(() => {
    if (route !== "/history" || !selectedCallId) return;
    const ws = api.createCallSocket(selectedCallId);
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data) as Record<string, unknown>;
      setLiveEvents((current) => [payload, ...current].slice(0, 50));
      void qc.invalidateQueries({ queryKey: ["calls"] });
    };
    return () => ws.close();
  }, [route, selectedCallId, qc]);

  const startCallMutation = useMutation({
    mutationFn: (payload: StartCallPayload) => api.startCall(payload),
    onSuccess: (result) => {
      setFormError(null);
      setSelectedCallId(result.call_id);
      setLiveEvents([]);
      navigate("/history");
      void qc.invalidateQueries({ queryKey: ["calls"] });
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : t("startCallError"));
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

  const toggleLanguage = () => {
    const next = uiLanguage === "es" ? "en" : "es";
    void i18n.changeLanguage(next);
  };

  const openBrowserLive = () => {
    const trimmedPrompt = taskPrompt.trim();
    if (trimmedPrompt.length < 5) {
      setFormError(t("browserModeRequiresTask"));
      return;
    }
    writeBrowserLiveDraft(trimmedPrompt);
    setFormError(null);
    navigate("/browser-live");
  };

  const submitCall = () => {
    const trimmedNumber = destinationNumber.trim();
    const trimmedPrompt = taskPrompt.trim();
    if (!trimmedNumber || !trimmedPrompt) {
      setFormError(t("minimalFormError"));
      return;
    }

    startCallMutation.mutate({
      destination_number: trimmedNumber,
      task_prompt: trimmedPrompt,
      ui_language: uiLanguage,
      call_language: callLanguage,
      disclosure_policy: "conditional",
      recording_enabled: true,
    });
  };

  return (
    <div className="min-h-screen bg-parchment-50 text-ink-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1320px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">{t("appEyebrow")}</p>
            <h1 className="font-display text-3xl leading-none text-ink-950 sm:text-4xl">
              {t("appTitle")}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <RouteTab
              active={route === "/"}
              label={t("navCalls")}
              onClick={() => navigate("/")}
            />
            <RouteTab
              active={route === "/history"}
              label={t("navHistory")}
              onClick={() => navigate("/history")}
            />
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex h-11 items-center rounded-full border border-black/10 bg-white px-4 text-sm font-semibold text-ink-900 transition hover:border-black/20"
              aria-label={t("switchLanguage")}
            >
              {uiLanguage === "es" ? "EN" : "ES"}
            </button>
          </div>
        </header>

        <main className="flex-1">
          {route === "/" ? (
            <CallsPage
              destinationNumber={destinationNumber}
              taskPrompt={taskPrompt}
              onDestinationChange={setDestinationNumber}
              onTaskPromptChange={setTaskPrompt}
              onBrowserLive={openBrowserLive}
              onSubmit={submitCall}
              error={formError}
              isPending={startCallMutation.isPending}
              language={uiLanguage}
            />
          ) : null}

          {route === "/history" ? (
            <HistoryPage
              calls={callsQuery.data ?? []}
              selectedCall={selectedCall}
              selectedCallId={selectedCallId}
              liveEvents={liveEvents}
              isLoading={callsQuery.isLoading}
              isError={callsQuery.isError}
              softphoneReady={softphoneReady}
              isTakingOver={takeoverMutation.isPending}
              isHangingUp={hangupMutation.isPending}
              onBackToCalls={() => navigate("/")}
              onSelectCall={setSelectedCallId}
              onTakeover={(callId) => takeoverMutation.mutate(callId)}
              onHangup={(callId) => hangupMutation.mutate(callId)}
              onJoin={joinCall}
            />
          ) : null}

          {route === "/browser-live" ? (
            <BrowserLivePage
              uiLanguage={uiLanguage}
              callLanguage={callLanguage}
              onBack={() => navigate("/")}
            />
          ) : null}
        </main>
      </div>

      <audio ref={remoteAudioRef} autoPlay playsInline />
    </div>
  );
}

function RouteTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold transition ${
        active
          ? "bg-ink-950 text-white"
          : "border border-black/10 bg-white text-ink-800 hover:border-black/20"
      }`}
    >
      {label}
    </button>
  );
}

function CallsPage({
  destinationNumber,
  taskPrompt,
  onDestinationChange,
  onTaskPromptChange,
  onBrowserLive,
  onSubmit,
  error,
  isPending,
  language,
}: {
  destinationNumber: string;
  taskPrompt: string;
  onDestinationChange: (value: string) => void;
  onTaskPromptChange: (value: string) => void;
  onBrowserLive: () => void;
  onSubmit: () => void;
  error: string | null;
  isPending: boolean;
  language: UiLanguage;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <Panel className="overflow-hidden">
        <div className="border-b border-black/5 px-6 py-6">
          <p className="eyebrow mb-2">{language === "es" ? "Llamadas" : "Calls"}</p>
          <h2 className="font-display text-[2rem] leading-none text-ink-950">
            {language === "es" ? "Inicia una llamada o ensayala en el navegador" : "Start a call or rehearse it in the browser"}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-700">
            {language === "es"
              ? "La configuracion avanzada queda resuelta por defecto: idioma inicial en espanol, grabacion activada y flujo centrado en ejecutar rapido."
              : "Advanced options now stay out of the way: Spanish is the default language, recording stays on, and the flow is optimized for fast execution."}
          </p>
        </div>

        <div className="grid gap-6 px-6 py-6">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-ink-900">
                {language === "es" ? "Numero de destino" : "Destination number"}
              </span>
              <input
                type="tel"
                value={destinationNumber}
                onChange={(event) => onDestinationChange(event.target.value)}
                placeholder="+34910000000"
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink-950 outline-none transition focus:border-black/20 focus:ring-4 focus:ring-black/5"
              />
            </label>

            <div className="grid gap-2">
              <span className="text-sm font-semibold text-ink-900">
                {language === "es" ? "Modo navegador" : "Browser mode"}
              </span>
              <button
                type="button"
                onClick={onBrowserLive}
                className="inline-flex min-h-[50px] items-center justify-center rounded-2xl border border-black/10 bg-parchment-100 px-4 text-sm font-semibold text-ink-900 transition hover:border-black/20 hover:bg-white"
              >
                {language === "es" ? "Hablar en navegador" : "Talk in browser"}
              </button>
            </div>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-ink-900">
              {language === "es" ? "Instruccion de la tarea" : "Task instruction"}
            </span>
            <textarea
              value={taskPrompt}
              onChange={(event) => onTaskPromptChange(event.target.value)}
              rows={7}
              placeholder={
                language === "es"
                  ? "Ejemplo: llama a la aseguradora, navega el IVR y pide una actualizacion del expediente 1234 de forma profesional."
                  : "Example: call the insurer, navigate the IVR, and ask for a professional update on case 1234."
              }
              className="w-full resize-y rounded-[26px] border border-black/10 bg-white px-4 py-4 text-sm leading-7 text-ink-950 outline-none transition focus:border-black/20 focus:ring-4 focus:ring-black/5"
            />
          </label>

          {error ? (
            <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700" role="alert">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onSubmit}
              disabled={isPending}
              className="inline-flex min-w-[180px] items-center justify-center rounded-full bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? (language === "es" ? "Iniciando..." : "Starting...") : language === "es" ? "Iniciar llamada" : "Start call"}
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function HistoryPage({
  calls,
  selectedCall,
  selectedCallId,
  liveEvents,
  isLoading,
  isError,
  softphoneReady,
  isTakingOver,
  isHangingUp,
  onBackToCalls,
  onSelectCall,
  onTakeover,
  onHangup,
  onJoin,
}: {
  calls: CallDetail[];
  selectedCall: CallDetail | null;
  selectedCallId: string | null;
  liveEvents: Record<string, unknown>[];
  isLoading: boolean;
  isError: boolean;
  softphoneReady: boolean;
  isTakingOver: boolean;
  isHangingUp: boolean;
  onBackToCalls: () => void;
  onSelectCall: (callId: string | null) => void;
  onTakeover: (callId: string) => void;
  onHangup: (callId: string) => void;
  onJoin: (callId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <CallList
        calls={calls}
        selectedCallId={selectedCallId}
        isLoading={isLoading}
        isError={isError}
        onSelect={onSelectCall}
        onNewCall={onBackToCalls}
      />

      {selectedCall ? (
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
          <CallDetailPanel
            call={selectedCall}
            events={liveEvents}
            softphoneReady={softphoneReady}
            isTakingOver={isTakingOver}
            isHangingUp={isHangingUp}
            isJoining={false}
            onTakeover={() => onTakeover(selectedCall.id)}
            onHangup={() => onHangup(selectedCall.id)}
            onJoin={() => void onJoin(selectedCall.id)}
          />
          <TranscriptPanel call={selectedCall} />
        </div>
      ) : (
        <Panel className="p-6">
          <EmptyState
            title={t("historyEmptyTitle")}
            description={t("historyEmptyDescription")}
            icon={<ClockIcon />}
            className="min-h-[320px]"
          />
        </Panel>
      )}
    </div>
  );
}

function BrowserLivePage({
  uiLanguage,
  callLanguage,
  onBack,
}: {
  uiLanguage: UiLanguage;
  callLanguage: CallLanguage;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const draft = readBrowserLiveDraft();
  const taskPrompt = draft?.task_prompt?.trim() ?? "";

  const [messages, setMessages] = useState<BrowserAgentMessage[]>([]);
  const [phase, setPhase] = useState<"idle" | "listening" | "thinking" | "speaking" | "unsupported">("idle");
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const speakingRef = useRef(false);
  const pendingRef = useRef(false);
  const messagesRef = useRef<BrowserAgentMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      recognitionRef.current?.stop();
      window.speechSynthesis.cancel();
    };
  }, []);

  const pushMessage = (message: BrowserAgentMessage) => {
    const next = [...messagesRef.current, message];
    messagesRef.current = next;
    setMessages(next);
  };

  const startListening = () => {
    const RecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setPhase("unsupported");
      setError(t("browserMicUnavailable"));
      return;
    }
    if (!activeRef.current || pendingRef.current || speakingRef.current) return;

    recognitionRef.current?.stop();

    const recognition = new RecognitionCtor();
    recognition.lang = callLanguage;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setPhase("listening");
    recognition.onresult = async (event: SpeechRecognitionEventLike) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (!transcript) return;

      setError(null);
      pendingRef.current = true;
      setPhase("thinking");
      pushMessage({ role: "user", content: transcript });

      try {
        const result = await api.browserAgentReply({
          message: transcript,
          history: messagesRef.current.slice(0, -1),
          ui_language: uiLanguage,
          call_language: callLanguage,
          task_prompt: taskPrompt,
        });
        pushMessage({ role: "assistant", content: result.reply });
        pendingRef.current = false;
        speakReply(result.reply, callLanguage, () => {
          if (!activeRef.current) {
            setPhase("idle");
            return;
          }
          startListening();
        }, () => {
          setPhase("speaking");
        }, () => {
          speakingRef.current = false;
        }, speakingRef);
      } catch (err) {
        pendingRef.current = false;
        setError(err instanceof Error ? err.message : t("browserLiveError"));
        setPhase(activeRef.current ? "idle" : "idle");
      }
    };
    recognition.onerror = () => {
      if (!activeRef.current) return;
      setError(t("browserRecognitionError"));
      setPhase("idle");
    };
    recognition.onend = () => {
      if (!activeRef.current || speakingRef.current || pendingRef.current) return;
      window.setTimeout(() => {
        if (activeRef.current) startListening();
      }, 350);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const startConversation = () => {
    if (!taskPrompt) {
      setError(t("browserModeRequiresTask"));
      return;
    }
    activeRef.current = true;
    setIsActive(true);
    setError(null);
    startListening();
  };

  const stopConversation = () => {
    activeRef.current = false;
    pendingRef.current = false;
    speakingRef.current = false;
    setIsActive(false);
    setPhase("idle");
    recognitionRef.current?.stop();
    window.speechSynthesis.cancel();
  };

  if (!taskPrompt) {
    return (
      <div className="mx-auto max-w-3xl">
        <Panel className="p-6">
          <EmptyState
            title={t("browserMissingTaskTitle")}
            description={t("browserMissingTaskDescription")}
            icon={<MicIcon />}
            action={
              <button
                type="button"
                onClick={onBack}
                className="rounded-full bg-ink-950 px-4 py-2 text-sm font-semibold text-white"
              >
                {t("backToCalls")}
              </button>
            }
            className="min-h-[320px]"
          />
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Panel className="overflow-hidden">
        <div className="border-b border-black/5 px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow mb-2">{t("browserLiveEyebrow")}</p>
              <h2 className="font-display text-[2rem] leading-none text-ink-950">
                {t("browserLiveTitle")}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-700">
                {t("browserLiveSubtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink-900 transition hover:border-black/20"
            >
              {t("backToCalls")}
            </button>
          </div>
        </div>

        <div className="grid gap-6 px-6 py-6">
          <div className="rounded-[24px] border border-black/10 bg-white px-5 py-4">
            <p className="eyebrow mb-2">{t("browserLiveTask")}</p>
            <p className="text-sm leading-7 text-ink-800">{taskPrompt}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-black/10 bg-parchment-100 px-5 py-4">
            <div>
              <p className="eyebrow mb-2">{t("browserLiveStatusLabel")}</p>
              <p className="text-sm font-semibold text-ink-900">{t(`browserLivePhase.${phase}`)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="browser-live-toggle"
                onClick={isActive ? stopConversation : startConversation}
                className={`inline-flex min-w-[150px] items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
                  isActive
                    ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : "bg-ink-950 text-white hover:bg-ink-900"
                }`}
              >
                {isActive ? t("browserLiveStop") : t("browserLiveStart")}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700" role="alert">
              {error}
            </div>
          ) : null}

          <div
            className="min-h-[360px] rounded-[28px] border border-black/10 bg-white px-4 py-4 shadow-card sm:px-6"
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <EmptyState
                icon={<MicIcon />}
                title={t("browserLiveEmptyTitle")}
                description={t("browserLiveEmptyDescription")}
                className="min-h-[280px] bg-transparent"
              />
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`flex items-start gap-3 ${
                      message.role === "assistant" ? "" : "flex-row-reverse"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold ${
                        message.role === "assistant"
                          ? "bg-ink-950 text-white"
                          : "border border-black/10 bg-parchment-100 text-ink-700"
                      }`}
                    >
                      {message.role === "assistant" ? "A" : "T"}
                    </div>
                    <div
                      className={`max-w-[86%] rounded-[24px] px-4 py-3 text-sm leading-7 shadow-card ${
                        message.role === "assistant"
                          ? "rounded-tl-md border border-black/6 bg-parchment-100 text-ink-900"
                          : "rounded-tr-md bg-ink-950 text-white"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function speakReply(
  text: string,
  language: CallLanguage,
  onEnd: () => void,
  onStart: () => void,
  onFinish: () => void,
  speakingRef: { current: boolean },
) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.onstart = () => {
    speakingRef.current = true;
    onStart();
  };
  utterance.onend = () => {
    onFinish();
    onEnd();
  };
  utterance.onerror = () => {
    onFinish();
    onEnd();
  };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3z" />
      <path d="M19 10a7 7 0 01-14 0" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  );
}
