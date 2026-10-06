"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ApiError } from "@/lib/api-client";
import type { PageStatus } from "@/lib/website-api";

export function errorText(error: unknown, fallback = "Something went wrong.") {
  return error instanceof ApiError ? error.message : fallback;
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border p-4 ${className}`} style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="m-0 text-sm font-bold">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warn" | "danger" | "ok" }) {
  const color = tone === "danger" ? "var(--app-danger-strong)" : tone === "warn" ? "var(--app-warning-text)" : tone === "ok" ? "var(--app-success-text)" : "var(--app-text)";
  return (
    <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="m-0 mt-0.5 text-lg font-bold" style={{ color }}>{value}</p>
      {hint && <p className="m-0 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{hint}</p>}
    </div>
  );
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  published: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)", label: "Published" },
  live: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)", label: "Live" },
  verified: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)", label: "Verified" },
  active: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)", label: "Active" },
  draft: { bg: "var(--app-surface-muted)", fg: "var(--app-text-muted)", label: "Draft" },
  scheduled: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)", label: "Scheduled" },
  pending: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)", label: "Pending" },
  maintenance: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)", label: "Maintenance" },
  unpublished: { bg: "var(--app-surface-muted)", fg: "var(--app-text-muted)", label: "Unpublished" },
  disabled: { bg: "var(--app-surface-muted)", fg: "var(--app-text-muted)", label: "Disabled" },
  not_published: { bg: "var(--app-surface-muted)", fg: "var(--app-text-muted)", label: "Not published" },
  failed: { bg: "var(--app-danger)", fg: "#fff", label: "Failed" },
  high: { bg: "var(--app-danger)", fg: "#fff", label: "High" },
  medium: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)", label: "Medium" },
  low: { bg: "var(--app-surface-muted)", fg: "var(--app-text-muted)", label: "Low" },
};

/** Status chip: always text + colour, never colour alone. */
export function StatusBadge({ status, label }: { status: PageStatus | string; label?: string }) {
  const s = STATUS_STYLE[status] ?? { bg: "var(--app-surface-muted)", fg: "var(--app-text-muted)", label: status };
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: s.bg, color: s.fg }}>
      {label ?? s.label}
    </span>
  );
}

export function Btn({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const style =
    variant === "primary"
      ? { background: "var(--app-primary)", color: "var(--app-primary-foreground)", borderColor: "var(--app-primary)" }
      : variant === "danger"
        ? { background: "transparent", color: "var(--app-danger-strong)", borderColor: "var(--app-danger-strong)" }
        : variant === "ghost"
          ? { background: "transparent", color: "var(--app-text-muted)", borderColor: "transparent" }
          : { background: "var(--app-surface)", color: "var(--app-text)", borderColor: "var(--app-border)" };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      style={{ ...style, ...props.style }}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>{label}</span>
      {children}
      {hint && <span className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>{hint}</span>}
    </label>
  );
}

export const inputClass = "w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none focus:ring-2";
export const inputStyle = { borderColor: "var(--app-border)", background: "var(--app-bg)", color: "var(--app-text)" } as const;

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode }) {
  const map = {
    info: { bg: "var(--app-surface-muted)", fg: "var(--app-text-muted)", border: "var(--app-border)" },
    warn: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)", border: "var(--app-warning-border)" },
    danger: { bg: "transparent", fg: "var(--app-danger-strong)", border: "var(--app-danger-strong)" },
    ok: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)", border: "var(--app-success-border)" },
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : undefined} className="rounded-xl border px-3 py-2 text-xs" style={{ background: map.bg, color: map.fg, borderColor: map.border }}>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 rounded-xl border border-dashed p-6 text-center text-sm" style={{ borderColor: "var(--app-border)", color: "var(--app-text-faint)" }}>
      {children}
    </p>
  );
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-col gap-4 p-4 md:p-6" style={{ color: "var(--app-text)" }}>
      {children}
    </main>
  );
}
