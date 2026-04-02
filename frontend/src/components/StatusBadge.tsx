type StatusConfig = {
  label: string;
  dotClass: string;
  badgeClass: string;
};

const STATUS_CONFIG: Record<string, StatusConfig> = {
  queued: {
    label: "Queued",
    dotClass: "bg-stone-400",
    badgeClass: "bg-white/70 text-ink-700 border-black/10",
  },
  dialing: {
    label: "Dialing",
    dotClass: "bg-sky-500 animate-pulse",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-100",
  },
  ivr: {
    label: "In IVR",
    dotClass: "bg-amber-500 animate-pulse",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-100",
  },
  agent_active: {
    label: "Agent Active",
    dotClass: "bg-emerald-500 animate-pulse",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  handoff_requested: {
    label: "Handoff Requested",
    dotClass: "bg-orange-500 animate-pulse",
    badgeClass: "bg-orange-50 text-orange-700 border-orange-100",
  },
  human_joining: {
    label: "Human Joining",
    dotClass: "bg-orange-500 animate-pulse",
    badgeClass: "bg-orange-50 text-orange-700 border-orange-100",
  },
  human_active: {
    label: "Human Active",
    dotClass: "bg-blue-600 animate-pulse",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-100",
  },
  completed: {
    label: "Completed",
    dotClass: "bg-emerald-600",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  failed: {
    label: "Failed",
    dotClass: "bg-rose-500",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-100",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const config = STATUS_CONFIG[normalized] ?? {
    label: status,
    dotClass: "bg-stone-400",
    badgeClass: "bg-white/70 text-ink-700 border-black/10",
  };

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${config.badgeClass}`}>
      <span className={`h-2 w-2 rounded-full ${config.dotClass}`} />
      {config.label}
    </span>
  );
}
