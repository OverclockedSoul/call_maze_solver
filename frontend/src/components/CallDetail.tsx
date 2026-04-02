import { useTranslation } from "react-i18next";

import type { CallDetail } from "../services/api";
import { Panel, PanelHeader } from "./Panel";
import { StatusBadge } from "./StatusBadge";

interface Props {
  call: CallDetail;
  events: Record<string, unknown>[];
  softphoneReady: boolean;
  isTakingOver: boolean;
  isHangingUp: boolean;
  isJoining: boolean;
  onTakeover: () => void;
  onHangup: () => void;
  onJoin: () => void;
}

const ACTIVE_STATUSES = [
  "dialing",
  "ivr",
  "agent_active",
  "handoff_requested",
  "human_joining",
  "human_active",
];

export function CallDetail({
  call,
  events,
  softphoneReady,
  isTakingOver,
  isHangingUp,
  isJoining,
  onTakeover,
  onHangup,
  onJoin,
}: Props) {
  const { t } = useTranslation();
  const isActive = ACTIVE_STATUSES.includes(call.status.toLowerCase());

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        eyebrow={t("selectedCall")}
        title={call.destination_number}
        description={call.task_prompt}
        action={<StatusBadge status={call.status} />}
      />

      <div className="grid gap-4 px-6 py-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <MetaCard title={t("status")}>
            <span className="text-sm font-semibold text-ink-950">{call.status.replace(/_/g, " ")}</span>
          </MetaCard>
          <MetaCard title={t("callLanguage")}>
            <span className="text-sm font-semibold text-ink-950">{call.call_language}</span>
          </MetaCard>
          <MetaCard title={t("recording")}>
            <span className="text-sm font-semibold text-ink-950">
              {call.recording_enabled ? t("recordingOn") : t("recordingOff")}
            </span>
          </MetaCard>
          <MetaCard title={t("startedAt")}>
            <span className="text-sm font-semibold text-ink-950">
              {call.started_at ? formatTimestamp(call.started_at) : t("notStarted")}
            </span>
          </MetaCard>
          <MetaCard title={t("updatedAt")}>
            <span className="text-sm font-semibold text-ink-950">{formatTimestamp(call.updated_at)}</span>
          </MetaCard>
        </div>

        {call.outcome_summary ? (
          <section className="shell-subpanel px-5 py-5">
            <p className="eyebrow mb-2">{t("outcome")}</p>
            <p className="text-sm leading-6 text-ink-800">{call.outcome_summary}</p>
          </section>
        ) : null}

        {call.failure_reason ? (
          <section className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-5">
            <p className="eyebrow mb-2 text-rose-700">{t("failureReason")}</p>
            <p className="text-sm leading-6 text-rose-700">{call.failure_reason}</p>
          </section>
        ) : null}

        {isActive ? (
          <section className="shell-subpanel px-5 py-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow mb-2">{t("callActions")}</p>
                <p className="text-sm leading-6 text-ink-700">{t("callActionsDescription")}</p>
              </div>
              {softphoneReady ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {t("softphoneReadyShort")}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <ActionButton
                onClick={onTakeover}
                disabled={isTakingOver}
                pending={isTakingOver}
                variant="secondary"
                icon={<UserIcon />}
              >
                {t("requestTakeover")}
              </ActionButton>
              <ActionButton
                onClick={onJoin}
                disabled={isJoining}
                pending={isJoining}
                variant={softphoneReady ? "success" : "secondary"}
                icon={<PhoneIncomingIcon />}
              >
                {softphoneReady ? t("softphoneReadyShort") : t("joinCall")}
              </ActionButton>
              <ActionButton
                onClick={onHangup}
                disabled={isHangingUp}
                pending={isHangingUp}
                variant="danger"
                icon={<PhoneOffIcon />}
              >
                {t("hangup")}
              </ActionButton>
            </div>
          </section>
        ) : null}

        <section className="rounded-[28px] border border-black/8 bg-white/75 overflow-hidden shadow-card">
          <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
            <div>
              <p className="eyebrow mb-1">{t("liveEvents")}</p>
              <p className="text-sm text-ink-700">{t("liveEventsDescription")}</p>
            </div>
            <span className="text-xs uppercase tracking-[0.16em] text-ink-500">{events.length}</span>
          </div>

          {events.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="font-display text-2xl text-ink-900">{t("eventsEmptyTitle")}</p>
              <p className="mt-2 text-sm leading-6 text-ink-700">{t("eventsEmptyDescription")}</p>
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto divide-y divide-black/5">
              {events.map((event, index) => (
                <article key={index} className="px-5 py-4">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-600">
                      {typeof event.type === "string" ? event.type : "event"}
                    </span>
                    {typeof event.created_at === "string" ? (
                      <span className="text-xs text-ink-500">{formatTimestamp(event.created_at)}</span>
                    ) : null}
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-[20px] bg-parchment-100 px-4 py-3 text-xs leading-6 text-ink-700">
                    {JSON.stringify(event, null, 2)}
                  </pre>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </Panel>
  );
}

function MetaCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="shell-subpanel px-5 py-4">
      <p className="eyebrow mb-3">{title}</p>
      {children}
    </div>
  );
}

type ButtonVariant = "secondary" | "danger" | "success";

function ActionButton({
  children,
  onClick,
  disabled,
  pending,
  variant,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  variant: ButtonVariant;
  icon: React.ReactNode;
}) {
  const variantClass: Record<ButtonVariant, string> = {
    secondary: "border-black/10 bg-white text-ink-900 hover:border-black/20 hover:bg-parchment-100",
    danger: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variantClass[variant]}`}
    >
      {pending ? <SpinnerIcon /> : icon}
      {children}
    </button>
  );
}

function formatTimestamp(isoString: string) {
  return new Date(isoString).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function PhoneIncomingIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 2 16 8 22 8" />
      <line x1="23" y1="1" x2="16" y2="8" />
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 .9h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.5 16.5L19 19a2 2 0 002 0v-3a2 2 0 00-2-1.72c-.969-.127-1.912-.361-2.81-.7a2 2 0 00-2.11.45L13 15.09A16 16 0 018.91 11l1.27-1.27a2 2 0 00.45-2.11c-.339-.907-.573-1.85-.7-2.81A2 2 0 008.28 3h-3A2 2 0 003 5c.056 2.97.926 5.856 2.5 8.39" />
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
