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
  onBack,
}: {
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const draft = readBrowserLiveDraft();
  const taskPrompt = draft?.task_prompt?.trim() ?? "";

  const [messages, setMessages] = useState<BrowserAgentMessage[]>([]);
  const [phase, setPhase] = useState<"idle" | "listening" | "thinking" | "speaking" | "unsupported">("idle");
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);
  const websocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const awaitingAssistantRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const turnHasSpeechRef = useRef(false);
  const lastVoiceAtRef = useRef(0);
  const playbackQueueRef = useRef<AudioBuffer[]>([]);
  const playbackNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const assistantTurnCompleteRef = useRef(false);
  const voiceDetectedRef = useRef(false);

  useEffect(() => {
    return () => {
      void teardownAudio();
    };
  }, []);

  const pushMessage = (message: BrowserAgentMessage) => {
    setMessages((current) => [...current, message]);
  };

  const finalizeTurnIfReady = () => {
    if (!activeRef.current || isSpeakingRef.current || !assistantTurnCompleteRef.current) return;
    awaitingAssistantRef.current = false;
    assistantTurnCompleteRef.current = false;
    setPhase("listening");
  };

  const playNextBufferedAudio = () => {
    const context = audioContextRef.current;
    if (!context || playbackNodeRef.current || playbackQueueRef.current.length === 0) {
      finalizeTurnIfReady();
      return;
    }

    const buffer = playbackQueueRef.current.shift();
    if (!buffer) {
      finalizeTurnIfReady();
      return;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    playbackNodeRef.current = source;
    isSpeakingRef.current = true;
    setPhase("speaking");
    source.onended = () => {
      playbackNodeRef.current = null;
      if (playbackQueueRef.current.length === 0) {
        isSpeakingRef.current = false;
      }
      playNextBufferedAudio();
    };
    source.start();
  };

  const enqueueAssistantAudio = async (base64Data: string, mimeType: string) => {
    const context = audioContextRef.current;
    if (!context) return;
    const sampleRate = parseSampleRate(mimeType);
    const pcmBytes = base64ToUint8Array(base64Data);
    const audioBuffer = pcm16ToAudioBuffer(context, pcmBytes, sampleRate);
    playbackQueueRef.current.push(audioBuffer);
    await context.resume();
    playNextBufferedAudio();
  };

  const sendAudioChunk = (samples: Float32Array) => {
    const socket = websocketRef.current;
    const context = audioContextRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !context) return;
    const boostedSamples = applyInputGain(samples, 1.8);
    socket.send(
      JSON.stringify({
        type: "audio_chunk",
        sample_rate: context.sampleRate,
        data: float32ToBase64Pcm(boostedSamples),
      }),
    );
  };

  const endUserTurn = () => {
    const socket = websocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || awaitingAssistantRef.current) return;
    awaitingAssistantRef.current = true;
    turnHasSpeechRef.current = false;
    assistantTurnCompleteRef.current = false;
    setPhase("thinking");
    socket.send(JSON.stringify({ type: "end_turn" }));
  };

  const handleAudioProcess = (event: AudioProcessingEvent) => {
    if (!activeRef.current || awaitingAssistantRef.current || isSpeakingRef.current) return;

    const samples = event.inputBuffer.getChannelData(0);
    const now = performance.now();
    const rms = computeRms(samples);
    const speechThreshold = 0.006;
    const lowSignalThreshold = 0.0025;
    const silenceMs = 1100;

    if (rms >= speechThreshold) {
      turnHasSpeechRef.current = true;
      voiceDetectedRef.current = true;
      lastVoiceAtRef.current = now;
      sendAudioChunk(samples);
      return;
    }

    if (rms >= lowSignalThreshold) {
      turnHasSpeechRef.current = true;
      lastVoiceAtRef.current = now;
      sendAudioChunk(samples);
      return;
    }

    if (!turnHasSpeechRef.current) return;

    sendAudioChunk(samples);
    if (now - lastVoiceAtRef.current >= silenceMs) {
      endUserTurn();
    }
  };

  const setupAudioPipeline = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
      setPhase("unsupported");
      setError(t("browserMicUnavailable"));
      throw new Error(t("browserMicUnavailable"));
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const context = new AudioContext();
    await context.resume();

    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const muteGain = context.createGain();
    muteGain.gain.value = 0;

    processor.onaudioprocess = handleAudioProcess;
    source.connect(processor);
    processor.connect(muteGain);
    muteGain.connect(context.destination);

    mediaStreamRef.current = stream;
    audioContextRef.current = context;
    sourceNodeRef.current = source;
    processorNodeRef.current = processor;
    muteGainRef.current = muteGain;
  };

  const teardownAudio = async () => {
    activeRef.current = false;
    awaitingAssistantRef.current = false;
    isSpeakingRef.current = false;
    turnHasSpeechRef.current = false;
    assistantTurnCompleteRef.current = false;
    voiceDetectedRef.current = false;
    playbackQueueRef.current = [];
    playbackNodeRef.current?.stop();
    playbackNodeRef.current = null;
    websocketRef.current?.close();
    websocketRef.current = null;
    processorNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    muteGainRef.current?.disconnect();
    processorNodeRef.current = null;
    sourceNodeRef.current = null;
    muteGainRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const startConversation = async () => {
    if (!taskPrompt) {
      setError(t("browserModeRequiresTask"));
      return;
    }
    try {
      await teardownAudio();
      const socket = api.createBrowserLiveSocket();
      websocketRef.current = socket;
      socket.onopen = async () => {
        try {
          socket.send(
            JSON.stringify({
              type: "start",
              task_prompt: taskPrompt,
              history: messages,
            }),
          );
          await setupAudioPipeline();
          activeRef.current = true;
          setIsActive(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : t("browserLiveError"));
          await teardownAudio();
          setPhase("idle");
          setIsActive(false);
        }
      };
      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as {
          type: string;
          data?: string;
          mime_type?: string;
          user_text?: string;
          assistant_text?: string;
          detail?: string;
        };

        if (payload.type === "ready") {
          setError(null);
          setPhase("listening");
          return;
        }
        if (payload.type === "audio_chunk" && payload.data && payload.mime_type) {
          void enqueueAssistantAudio(payload.data, payload.mime_type);
          return;
        }
        if (payload.type === "turn_complete") {
          if (payload.user_text) pushMessage({ role: "user", content: payload.user_text });
          if (payload.assistant_text) pushMessage({ role: "assistant", content: payload.assistant_text });
          assistantTurnCompleteRef.current = true;
          finalizeTurnIfReady();
          return;
        }
        if (payload.type === "error") {
          setError(payload.detail ?? t("browserLiveError"));
          void stopConversation();
        }
      };
      socket.onerror = () => {
        setError(t("browserLiveError"));
      };
      socket.onclose = () => {
        if (activeRef.current) {
          setPhase("idle");
          setIsActive(false);
          activeRef.current = false;
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : t("browserLiveError"));
      await teardownAudio();
      setPhase("idle");
      setIsActive(false);
    }
  };

  const stopConversation = async () => {
    websocketRef.current?.send(JSON.stringify({ type: "stop" }));
    await teardownAudio();
    setIsActive(false);
    setPhase("idle");
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
                onClick={() => void (isActive ? stopConversation() : startConversation())}
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
                    data-testid={`browser-live-message-${message.role}`}
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

function computeRms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

function float32ToBase64Pcm(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function applyInputGain(samples: Float32Array, gain: number): Float32Array {
  const boosted = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    boosted[i] = Math.max(-1, Math.min(1, samples[i] * gain));
  }
  return boosted;
}

function base64ToUint8Array(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseSampleRate(mimeType: string): number {
  const match = /rate=(\d+)/i.exec(mimeType);
  return match ? Number(match[1]) : 24000;
}

function pcm16ToAudioBuffer(context: AudioContext, pcmBytes: Uint8Array, sampleRate: number): AudioBuffer {
  const frameCount = Math.floor(pcmBytes.byteLength / 2);
  const audioBuffer = context.createBuffer(1, frameCount, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);
  for (let i = 0; i < frameCount; i += 1) {
    channelData[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return audioBuffer;
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
