import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-h-[220px] flex-col items-center justify-center rounded-[24px] border border-dashed border-black/10 bg-white/45 px-6 py-10 text-center ${className}`.trim()}>
      {icon ? <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-black/5 text-ink-700">{icon}</div> : null}
      <h3 className="font-display text-2xl text-ink-950">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-6 text-ink-700">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
