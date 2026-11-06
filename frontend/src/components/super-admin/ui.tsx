"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Loader2, Search, ShieldCheck, X } from "lucide-react";
import { ApiError } from "@/lib/api-client";

// ------------------------------------------------------------------ format

export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits === 2 ? 2 : 0 });
export const fmtUsd = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
export const fmtDateTime = (d: string | Date | null | undefined) =>
  d
    ? `${new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`
    : "—";
export function fmtAgo(d: string | null | undefined) {
  if (!d) return "Never";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}
export const humanize = (s: string | null | undefined) => (s ? s.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");
export const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

// ------------------------------------------------------------------ layout

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.3px]" style={{ color: "var(--app-text)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="m-0 mt-1 text-[13px]" style={{ color: "var(--app-text-faintest)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "", pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`rounded-2xl border ${className}`} style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b px-5 py-3.5" style={{ borderColor: "var(--app-border)" }}>
          <h2 className="m-0 text-[14px] font-bold" style={{ color: "var(--app-text)" }}>
            {title}
          </h2>
          {actions}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "warning" | "success" }) {
  const color = tone === "danger" ? "var(--app-danger-strong)" : tone === "warning" ? "var(--app-warning-text)" : tone === "success" ? "var(--app-success-text)" : "var(--app-text)";
  return (
    <div className="rounded-2xl border px-4 py-3.5" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
      <div className="text-[11.5px] font-semibold uppercase tracking-[.4px]" style={{ color: "var(--app-text-faintest)" }}>
        {label}
      </div>
      <div className="mt-1 text-[22px] font-extrabold tracking-[-0.3px]" style={{ color }}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
const TONES: Record<Tone, { bg: string; fg: string; bd: string }> = {
  neutral: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)", bd: "var(--app-border)" },
  success: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)", bd: "var(--app-success-border)" },
  warning: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)", bd: "var(--app-warning-border)" },
  danger: { bg: "#fef3f2", fg: "var(--app-danger-strong)", bd: "#fecdca" },
  info: { bg: "#eff4ff", fg: "var(--app-info)", bd: "#c7d7fe" },
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border px-2 py-[1px] text-[11px] font-bold" style={{ background: t.bg, color: t.fg, borderColor: t.bd }}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  active: "success",
  trialing: "info",
  past_due: "warning",
  paused: "warning",
  cancelled: "neutral",
  suspended: "danger",
  archived: "neutral",
  disabled: "neutral",
  connected: "success",
  needs_attention: "warning",
  not_connected: "neutral",
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "neutral",
  completed: "success",
  failed: "danger",
  refused: "danger",
  allocated: "info",
  committed: "success",
  reserved: "info",
  released: "neutral",
  expired: "neutral",
  revoked: "neutral",
  scheduled: "info",
  restricted: "warning",
  global_disabled: "danger",
  disabled_by_business: "neutral",
  enabled_by_subscription: "success",
};

const STATUS_LABEL: Record<string, string> = {
  past_due: "Past due",
  trialing: "Trial",
  global_disabled: "Disabled globally",
  disabled_by_business: "Off (business choice)",
  enabled_by_subscription: "Enabled by subscription",
  suspended: "Suspended",
  restricted: "Restricted (read-only)",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge>Not started</Badge>;
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? humanize(status)}</Badge>;
}

// ------------------------------------------------------------------ states

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 p-6 text-[13px]" style={{ color: "var(--app-text-faintest)" }}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border p-4 text-[13px]" style={{ borderColor: "#fecdca", background: "#fef3f2", color: "var(--app-danger-strong)" }}>
      {errMsg(error)}
      {onRetry && (
        <button type="button" onClick={onRetry} className="ms-3 font-bold underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="p-8 text-center text-[13px]" style={{ color: "var(--app-text-faintest)" }}>
      {children}
    </div>
  );
}

/** For signals Noxtill genuinely does not capture — said plainly, never filled with a guess. */
export function NotTracked({ children }: { children: ReactNode }) {
  return (
    <span className="text-[12px] italic" style={{ color: "var(--app-text-disabled)" }}>
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ table

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className="whitespace-nowrap border-b px-3 py-2.5 text-start text-[11px] font-bold uppercase tracking-[.4px]"
                style={{ borderColor: "var(--app-border)", color: "var(--app-text-faintest)", background: "var(--app-surface-2)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function Td({ children, className = "", mono = false }: { children?: ReactNode; className?: string; mono?: boolean }) {
  return (
    <td className={`border-b px-3 py-2.5 align-top ${mono ? "font-mono text-[12px]" : ""} ${className}`} style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}>
      {children}
    </td>
  );
}

export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold hover:underline" style={{ color: "var(--app-text)" }}>
      {children}
    </Link>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-3 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>
      <span>
        {total === 0 ? "0 results" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${fmtNum(total)}`}
      </span>
      <div className="flex gap-1.5">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="px-2 py-1">
          Page {page} of {pages}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ inputs

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline"; size?: "sm" | "md" }) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "var(--app-primary)", color: "#fff", borderColor: "var(--app-primary)" },
    danger: { background: "var(--app-danger-strong)", color: "#fff", borderColor: "var(--app-danger-strong)" },
    outline: { background: "var(--app-surface)", color: "var(--app-text-muted)", borderColor: "var(--app-border-strong)" },
    ghost: { background: "transparent", color: "var(--app-text-muted)", borderColor: "var(--app-border)" },
  };
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center gap-1.5 rounded-lg border font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3.5 py-2 text-[13px]"} ${className}`}
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

export const inputCls = "w-full rounded-lg border px-3 py-2 text-[13px] outline-none focus:border-[var(--app-primary)]";
export const inputStyle: React.CSSProperties = { borderColor: "var(--app-border-strong)", background: "var(--app-surface)", color: "var(--app-text)" };

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block min-w-[220px] flex-1">
      <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
      <span className="sr-only">{placeholder}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} ps-8`} style={inputStyle} />
    </label>
  );
}

export function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} style={{ ...inputStyle, width: "auto" }}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>
      {label}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} style={{ ...inputStyle, width: "auto" }} />
    </label>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold" style={{ color: "var(--app-text-muted)" }}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: string; hidden?: boolean }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--app-border)" }}>
      {tabs
        .filter((t) => !t.hidden)
        .map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => onChange(t.key)}
              className="-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-bold"
              style={{ borderColor: active ? "var(--app-primary)" : "transparent", color: active ? "var(--app-text)" : "var(--app-text-faintest)" }}
            >
              {t.label}
            </button>
          );
        })}
    </div>
  );
}

// ---------------------------------------------------------- action dialog

/**
 * Every privileged change goes through this: a required reason (kept in the audit log) and, for
 * high-risk actions, a fresh authenticator code. The server enforces both — this is only the form.
 */
export function ActionDialog({
  title,
  description,
  confirmLabel,
  danger,
  reauth,
  children,
  onClose,
  onConfirm,
  canConfirm = true,
  noReason = false,
}: {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  reauth?: boolean;
  children?: ReactNode;
  onClose: () => void;
  onConfirm: (auth: { reason: string; totpCode: string }) => Promise<unknown>;
  canConfirm?: boolean;
  noReason?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = canConfirm && (noReason || reason.trim().length >= 5) && (!reauth || /^\d{6}$/.test(code));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ reason: reason.trim(), totpCode: code });
      onClose();
    } catch (err) {
      setError(errMsg(err));
      if (err instanceof ApiError && err.code === "ADMIN_TOTP_INVALID") setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-2xl border p-5 shadow-xl"
        style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", animation: "nxModalIn .18s ease-out" }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="m-0 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        {description && (
          <div className="mb-4 text-[13px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
            {description}
          </div>
        )}
        <div className="space-y-3">
          {children}
          {!noReason && (
            <Field label="Reason (kept in the audit log)">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputCls} style={inputStyle} placeholder="Why are you making this change?" required />
            </Field>
          )}
          {reauth && (
            <Field label="Authenticator code" hint="High-risk action: confirm with a fresh 6-digit code from your authenticator app.">
              <div className="relative">
                <ShieldCheck className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--app-primary)" }} aria-hidden />
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={`${inputCls} ps-8 font-mono tracking-[4px]`}
                  style={inputStyle}
                  placeholder="000000"
                />
              </div>
            </Field>
          )}
        </div>
        {error && (
          <div role="alert" className="mt-3 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: "#fef3f2", color: "var(--app-danger-strong)" }}>
            {error}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} disabled={!ok || busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function KeyValue({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(120px,40%)_1fr] gap-x-4 gap-y-2 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt style={{ color: "var(--app-text-faintest)" }}>{k}</dt>
          <dd className="m-0 min-w-0 break-words" style={{ color: "var(--app-text)" }}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Meter({ used, limit }: { used: number; limit: number | null }) {
  if (limit == null) return null;
  const pct = limit <= 0 ? (used > 0 ? 100 : 0) : Math.min(100, (used / limit) * 100);
  // Red only when actually over; exactly at the limit is a warning (new ones are refused, existing keep working).
  const color = used > limit ? "var(--app-danger)" : pct >= 90 ? "var(--app-orange)" : pct >= 75 ? "#eab308" : "var(--app-primary)";
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--app-border)" }} aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
