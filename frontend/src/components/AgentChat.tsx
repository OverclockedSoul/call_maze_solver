import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { BrowserAgentMessage } from "../services/api";
import { EmptyState } from "./EmptyState";
import { Panel, PanelHeader } from "./Panel";

interface Props {
  messages: BrowserAgentMessage[];
  inputValue: string;
  listening: boolean;
  pending: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onToggleListening: () => void;
}

export function AgentChat({
  messages,
  inputValue,
  listening,
  pending,
  onInputChange,
  onSend,
  onToggleListening,
}: Props) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pending]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <Panel className="flex h-full min-h-[360px] flex-col overflow-hidden">
      <PanelHeader
        eyebrow={t("browserAgentEyebrow")}
        title={t("browserAgentTitle")}
        description={t("browserAgentSubtitle")}
        action={<ModeIndicator listening={listening} pending={pending} />}
      />

      <div className="border-b border-black/5 bg-white/35 px-6 py-3 text-xs uppercase tracking-[0.16em] text-ink-500">
        {t("browserAgentHelper")}
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 py-4 sm:px-6"
        aria-live="polite"
        aria-label={t("browserAgentConversation")}
      >
        {messages.length === 0 ? (
          <EmptyState
            icon={<SparkIcon />}
            title={t("browserAgentEmpty")}
            description={t("browserAgentEmptyDescription")}
            className="min-h-[320px] bg-transparent"
          />
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <ChatBubble key={`${message.role}-${index}`} message={message} />
            ))}

            {pending ? (
              <div className="flex items-start gap-3">
                <Avatar label="A" assistant />
                <div className="rounded-[24px] rounded-tl-md border border-black/6 bg-white px-4 py-3 shadow-card">
                  <ThinkingDots />
                </div>
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-black/5 px-4 py-4 sm:px-6">
        <div className="rounded-[28px] border border-black/10 bg-white/85 p-3 shadow-inset">
          <label htmlFor="browser-agent-input" className="sr-only">
            {t("browserAgentPlaceholder")}
          </label>
          <textarea
            id="browser-agent-input"
            data-testid="agent-input"
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("browserAgentPlaceholder")}
            rows={3}
            className="min-h-[88px] w-full resize-none bg-transparent text-sm leading-6 text-ink-950 outline-none placeholder:text-ink-500"
            disabled={pending}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-ink-600">
              {listening ? t("browserAgentListening") : t("browserAgentVoiceHint")}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="agent-mic"
                onClick={onToggleListening}
                title={listening ? t("stopListening") : t("startListening")}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition ${
                  listening
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-black/10 bg-parchment-100 text-ink-700 hover:border-black/20 hover:bg-white"
                }`}
              >
                {listening ? <MicOffIcon /> : <MicIcon />}
              </button>
              <button
                type="button"
                data-testid="agent-send"
                onClick={onSend}
                disabled={pending || !inputValue.trim()}
                className="inline-flex min-w-[112px] items-center justify-center gap-2 rounded-full bg-ink-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? <SpinnerIcon /> : <SendIcon />}
                {t("sendMessage")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function ChatBubble({ message }: { message: BrowserAgentMessage }) {
  const { t } = useTranslation();
  const isAssistant = message.role === "assistant";

  return (
    <div className={`flex items-start gap-3 ${isAssistant ? "" : "flex-row-reverse"}`}>
      <Avatar label={isAssistant ? "A" : "Y"} assistant={isAssistant} />
      <div className={`max-w-[88%] ${isAssistant ? "" : "flex flex-col items-end"}`}>
        <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">
          {isAssistant ? t("agentLabel") : t("youLabel")}
        </p>
        <div
          className={`rounded-[24px] px-4 py-3 text-sm leading-6 shadow-card ${
            isAssistant
              ? "rounded-tl-md border border-black/6 bg-white text-ink-900"
              : "rounded-tr-md bg-ink-950 text-white"
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

function Avatar({ label, assistant }: { label: string; assistant: boolean }) {
  return (
    <div
      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${
        assistant ? "bg-ink-950 text-white" : "border border-black/10 bg-white text-ink-700"
      }`}
    >
      {label}
    </div>
  );
}

function ModeIndicator({ listening, pending }: { listening: boolean; pending: boolean }) {
  let label = "Ready";
  let className = "border-black/10 bg-white/80 text-ink-600";

  if (pending) {
    label = "Replying";
    className = "border-amber-200 bg-amber-50 text-amber-700";
  } else if (listening) {
    label = "Listening";
    className = "border-rose-200 bg-rose-50 text-rose-700";
  }

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${className}`}>
      <span className={`h-2 w-2 rounded-full ${pending ? "bg-amber-500" : listening ? "bg-rose-500" : "bg-emerald-500"}`} />
      {label}
    </span>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-2 w-2 animate-bounce rounded-full bg-ink-400"
          style={{ animationDelay: `${index * 0.12}s` }}
        />
      ))}
    </div>
  );
}

function SparkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 4.7L18.6 9l-4.7 1.9L12 15.6l-1.9-4.7L5.4 9l4.7-1.3L12 3z" />
      <path d="M19 14l.95 2.05L22 17l-2.05.95L19 20l-.95-2.05L16 17l2.05-.95L19 14z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3z" />
      <path d="M19 10a7 7 0 01-14 0" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V5a3 3 0 00-5.94-.6" />
      <path d="M17 16.95A7 7 0 015 10v-1m14 0v1a7 7 0 01-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}
