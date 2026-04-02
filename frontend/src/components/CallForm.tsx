import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Panel, PanelHeader } from "./Panel";

const fieldClass =
  "w-full rounded-2xl border border-black/10 bg-white/80 px-4 py-3 text-sm text-ink-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition outline-none placeholder:text-ink-500 focus:border-ink-500/40 focus:ring-4 focus:ring-black/5";

export function CallForm({
  onSubmit,
  isPending,
  error,
}: {
  onSubmit: (event: React.FormEvent) => void;
  isPending: boolean;
  error?: string | null;
}) {
  const { t } = useTranslation();
  const {
    register,
    formState: { errors },
  } = useFormContext();

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        eyebrow={t("startCall")}
        title={t("composeTitle")}
        description={t("composeSubtitle")}
      />

      <form onSubmit={onSubmit} className="grid gap-6 px-6 py-6">
        <FormSection title={t("callBasics")} description={t("callBasicsDescription")}>
          <div className="grid gap-5">
            <Field
              label={t("destinationNumber")}
              htmlFor="destination_number"
              error={errors.destination_number?.message as string | undefined}
            >
              <input
                id="destination_number"
                type="tel"
                placeholder="+34910000000"
                className={fieldClass}
                {...register("destination_number")}
              />
            </Field>

            <Field
              label={t("taskPrompt")}
              htmlFor="task_prompt"
              error={errors.task_prompt?.message as string | undefined}
            >
              <textarea
                id="task_prompt"
                rows={6}
                placeholder={t("taskPromptPlaceholder")}
                className={`${fieldClass} resize-y leading-6`}
                {...register("task_prompt")}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title={t("agentBehavior")} description={t("agentBehaviorDescription")}>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label={t("uiLanguage")} htmlFor="ui_language">
              <div className="relative">
                <select id="ui_language" className={fieldClass} {...register("ui_language")}>
                  <option value="en">English</option>
                  <option value="es">Espanol</option>
                </select>
                <ChevronIcon />
              </div>
            </Field>

            <Field label={t("callLanguage")} htmlFor="call_language">
              <div className="relative">
                <select id="call_language" className={fieldClass} {...register("call_language")}>
                  <option value="en-US">English (US)</option>
                  <option value="es-ES">Espanol (ES)</option>
                </select>
                <ChevronIcon />
              </div>
            </Field>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
            <Field label={t("disclosurePolicy")} htmlFor="disclosure_policy">
              <div className="relative">
                <select id="disclosure_policy" className={fieldClass} {...register("disclosure_policy")}>
                  <option value="always">{t("policyAlways")}</option>
                  <option value="conditional">{t("policyConditional")}</option>
                  <option value="never_without_review">{t("policyReview")}</option>
                </select>
                <ChevronIcon />
              </div>
            </Field>

            <div className="rounded-[24px] border border-black/10 bg-white/70 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-500">
                {t("recording")}
              </p>
              <label className="mt-3 flex cursor-pointer items-center justify-between gap-4">
                <span className="text-sm leading-6 text-ink-700">{t("recordingEnabled")}</span>
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-black/15 text-ink-950 focus:ring-ink-500"
                  {...register("recording_enabled")}
                />
              </label>
            </div>
          </div>
        </FormSection>

        {error ? (
          <div
            className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-black/5 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-ink-700">{t("composeFooter")}</p>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <SpinnerIcon /> : <PhoneIcon />}
            {isPending ? t("starting") : t("startCall")}
          </button>
        </div>
      </form>
    </Panel>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="shell-subpanel px-5 py-5">
      <div className="mb-5">
        <p className="eyebrow mb-2">{title}</p>
        <p className="max-w-2xl text-sm leading-6 text-ink-700">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  htmlFor,
  label,
  error,
  children,
}: {
  htmlFor: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-ink-900">
        {label}
      </label>
      {children}
      {error ? <p className="mt-2 text-xs font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}

function ChevronIcon() {
  return (
    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-ink-500">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </span>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 .9h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}
