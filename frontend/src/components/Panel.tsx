import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`shell-panel ${className}`.trim()}>{children}</section>;
}

export function PanelHeader({
  eyebrow,
  title,
  description,
  action,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex flex-col gap-4 border-b border-black/5 px-6 py-5 sm:flex-row sm:items-start sm:justify-between ${className}`.trim()}>
      <div>
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h2 className="font-display text-[1.55rem] leading-none text-ink-950 sm:text-[1.75rem]">{title}</h2>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-700">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
