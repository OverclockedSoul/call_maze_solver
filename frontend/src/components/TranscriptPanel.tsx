import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { CallDetail, TranscriptEntry } from "../services/api";
import { EmptyState } from "./EmptyState";
import { Panel, PanelHeader } from "./Panel";

interface Props {
  call: CallDetail;
}

const AGENT_SPEAKERS = ["agent", "ai", "assistant", "system"];

function isAgentSpeaker(speaker: string) {
  return AGENT_SPEAKERS.some((item) => speaker.toLowerCase().includes(item));
}

export function TranscriptPanel({ call }: Props) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const entries = call.transcript_entries;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <Panel className="flex h-full min-h-[420px] flex-col overflow-hidden">
      <PanelHeader
        eyebrow={t("transcript")}
        title={t("transcriptTitle")}
        description={t("transcriptDescription")}
        action={
          <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-600">
            {entries.length} {entries.length === 1 ? t("entrySingle") : t("entryPlural")}
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {entries.length === 0 ? (
          <EmptyState
            icon={<TranscriptIcon />}
            title={t("transcriptEmptyTitle")}
            description={t("transcriptEmptyDescription")}
            className="min-h-[320px] bg-transparent"
          />
        ) : (
          <div className="space-y-4">
            {entries.map((entry, index) => (
              <TranscriptBubble key={`${entry.created_at}-${index}`} entry={entry} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </Panel>
  );
}

function TranscriptBubble({ entry }: { entry: TranscriptEntry }) {
  const isAgent = isAgentSpeaker(entry.speaker);

  return (
    <div className={`flex items-start gap-3 ${isAgent ? "" : "flex-row-reverse"}`}>
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold uppercase ${
          isAgent ? "bg-ink-950 text-white" : "border border-black/10 bg-white text-ink-700"
        }`}
      >
        {entry.speaker.charAt(0)}
      </div>

      <div className={`max-w-[88%] ${isAgent ? "" : "flex flex-col items-end"}`}>
        <div className="mb-1 flex flex-wrap items-center gap-2 px-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            {entry.speaker}
          </span>
          <span className="text-xs text-ink-500">{formatTimestamp(entry.created_at)}</span>
          {!entry.is_final ? (
            <span className="rounded-full bg-parchment-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
              interim
            </span>
          ) : null}
        </div>

        <div
          className={`rounded-[24px] px-4 py-3 text-sm leading-6 shadow-card ${
            isAgent
              ? "rounded-tl-md border border-black/6 bg-white text-ink-900"
              : "rounded-tr-md bg-ink-950 text-white"
          } ${entry.is_final ? "" : "opacity-70"}`}
        >
          {entry.text}
        </div>
        <span className="mt-1 px-1 text-[11px] uppercase tracking-[0.16em] text-ink-500">
          {entry.language}
        </span>
      </div>
    </div>
  );
}

function formatTimestamp(isoString: string) {
  return new Date(isoString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function TranscriptIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}
