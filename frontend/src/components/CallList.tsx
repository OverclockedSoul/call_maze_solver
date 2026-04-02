import { useTranslation } from "react-i18next";

import type { CallDetail } from "../services/api";
import { EmptyState } from "./EmptyState";
import { Panel, PanelHeader } from "./Panel";
import { StatusBadge } from "./StatusBadge";

function formatTimeStamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CallList({
  calls,
  selectedCallId,
  isLoading,
  isError,
  onSelect,
  onNewCall,
}: {
  calls: CallDetail[];
  selectedCallId: string | null;
  isLoading: boolean;
  isError: boolean;
  onSelect: (id: string | null) => void;
  onNewCall: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        eyebrow={t("callHistory")}
        title={t("workspaceTitle")}
        description={t("workspaceSubtitle")}
        action={
          <button
            type="button"
            onClick={onNewCall}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink-950 transition hover:border-black/20 hover:bg-white/80"
          >
            <PlusIcon />
            {t("newCall")}
          </button>
        }
      />

      <div className="px-4 pb-4 pt-3">
        {isLoading && calls.length === 0 ? (
          <div className="grid gap-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="shell-subpanel h-[108px] animate-pulse bg-white/70" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={<AlertIcon />}
            title={t("callListErrorTitle")}
            description={t("callListErrorDescription")}
            action={
              <button
                type="button"
                onClick={onNewCall}
                className="rounded-full bg-ink-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-900"
              >
                {t("newCall")}
              </button>
            }
          />
        ) : calls.length === 0 ? (
          <EmptyState
            icon={<PhoneIcon />}
            title={t("callListEmptyTitle")}
            description={t("callListEmptyDescription")}
            action={
              <button
                type="button"
                onClick={onNewCall}
                className="rounded-full bg-ink-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-900"
              >
                {t("newCall")}
              </button>
            }
          />
        ) : (
          <div className="grid gap-3">
            {calls.map((call) => {
              const selected = call.id === selectedCallId;
              return (
                <button
                  key={call.id}
                  type="button"
                  onClick={() => onSelect(selected ? null : call.id)}
                  className={`shell-subpanel w-full p-4 text-left transition duration-200 ${
                    selected
                      ? "border-ink-950/20 bg-white shadow-card-lg"
                      : "hover:-translate-y-0.5 hover:border-black/20 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-500">{formatTimeStamp(call.created_at)}</p>
                      <h3 className="mt-2 truncate font-mono text-[1rem] font-semibold text-ink-950">{call.destination_number}</h3>
                    </div>
                    <StatusBadge status={call.status} />
                  </div>

                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-ink-700">{call.task_prompt}</p>

                  <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-ink-500">
                    <span>{call.call_language}</span>
                    <span>{call.recording_enabled ? t("recordingOn") : t("recordingOff")}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 .9h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
