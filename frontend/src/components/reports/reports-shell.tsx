"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchReportsLibrary } from "@/lib/reports-api";
import { fetchScheduledExports } from "@/lib/scheduled-exports-api";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { R, RIcon, chipStyle, currentPeriod, monthName, periodPillLabel, relativeDateTime, shiftPeriod } from "./reports-ui";
import { useActiveBusinessName, useReports } from "./reports-context";
import { ReportsOverlays } from "./reports-overlays";

interface TabDef {
  key: string;
  label: string;
  icon: string;
  href: string;
}

const TABS: TabDef[] = [
  { key: "all", label: "All Reports", icon: "file-bar-chart", href: "/reports" },
  { key: "scheduled", label: "Scheduled Reports", icon: "calendar-clock", href: "/reports/scheduled" },
  { key: "tax", label: "Tax Reports", icon: "receipt-text", href: "/reports/tax" },
  { key: "export", label: "Export Your Data", icon: "file-down", href: "/reports/export" },
];

const TITLES: Record<string, string> = { all: "Reports", scheduled: "Scheduled Reports", tax: "Tax Reports", export: "Export Your Data" };

function screenOf(pathname: string): string {
  if (pathname.startsWith("/reports/scheduled")) return "scheduled";
  if (pathname.startsWith("/reports/tax")) return "tax";
  if (pathname.startsWith("/reports/export")) return "export";
  return "all";
}

function PeriodPill() {
  const { period, setPeriod } = useReports();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const months = Array.from({ length: 12 }, (_, i) => shiftPeriod(currentPeriod(), -i));
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ height: 34, minHeight: 34, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 7, padding: "0 11px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: R.ink }}
      >
        <RIcon name="calendar-days" size={14} style={{ color: R.label }} />
        <span>{periodPillLabel(period)}</span>
      </button>
      {open ? (
        <div role="listbox" className="nx-scroll" style={{ position: "absolute", right: 0, top: 40, zIndex: 60, width: 190, maxHeight: 320, overflowY: "auto", background: "#fff", border: `1px solid ${R.border}`, borderRadius: 10, boxShadow: "0 14px 34px rgba(12,23,39,.14)", padding: 5 }}>
          {months.map((m) => (
            <button
              key={m}
              type="button"
              role="option"
              aria-selected={m === period}
              onClick={() => {
                setPeriod(m);
                setOpen(false);
              }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: 0, background: m === period ? R.greenSoft : "transparent", color: m === period ? "#15803D" : R.ink, fontSize: 12.5, fontWeight: m === period ? 700 : 600, cursor: "pointer" }}
            >
              {monthName(m)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HeaderSearch() {
  const { openPanel } = useReports();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      e.preventDefault();
      openPanel({ type: "ai" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPanel]);
  return (
    <button
      type="button"
      onClick={() => openPanel({ type: "ai" })}
      style={{ width: "100%", minWidth: 0, height: 38, minHeight: 38, display: "flex", alignItems: "center", gap: 9, padding: "0 12px", background: R.page, border: `1px solid ${R.border}`, borderRadius: 10, cursor: "text", textAlign: "left" }}
    >
      <RIcon name="sparkles" size={15} style={{ color: "#6D28D9" }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#8B97A6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Describe a report — “top 20 products by profit this month”</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: R.label, background: "#fff", border: `1px solid ${R.border}`, borderBottomWidth: 2, borderRadius: 5, padding: "2px 6px" }}>/</span>
    </button>
  );
}

function HeaderActions({ screen }: { screen: string }) {
  const { openPanel } = useReports();
  const branch = useActiveBusinessName();
  return (
    <>
      {screen === "all" || screen === "tax" ? <PeriodPill /> : null}
      <span style={{ ...chipStyle("neutral"), height: 34, minHeight: 34, flexShrink: 0, fontSize: 12.5, padding: "0 11px" }}>
        <RIcon name="building-2" size={14} />
        {branch}
      </span>
      <button
        type="button"
        onClick={() => openPanel({ type: "ai" })}
        style={{ height: 34, minHeight: 34, flexShrink: 0, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 7, padding: "0 13px", borderRadius: 10, background: R.green, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: 0 }}
      >
        <RIcon name="sparkles" size={15} />
        Create with AI
      </button>
      <button
        type="button"
        onClick={() => openPanel({ type: "builder" })}
        style={{ height: 34, minHeight: 34, flexShrink: 0, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, padding: "0 11px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: R.ink }}
      >
        <RIcon name="plus" size={14} strokeWidth={2.25} />
        Build
      </button>
    </>
  );
}

function ShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const screen = screenOf(pathname);
  const { period } = useReports();
  const branch = useActiveBusinessName();
  const library = useQuery({ queryKey: ["reports", "library", period], queryFn: () => fetchReportsLibrary(period) });
  const schedules = useQuery({ queryKey: ["reports", "schedules"], queryFn: fetchScheduledExports });

  const reportSchedules = (schedules.data ?? []).filter((s) => s.reportKind);
  const nextRun = reportSchedules
    .filter((s) => s.active && s.nextRunAt)
    .map((s) => s.nextRunAt as string)
    .sort()[0];

  const subtitles: Record<string, string> = {
    all: `${library.data?.periodLabel ?? monthName(period)} · ${branch}`,
    scheduled: schedules.data ? `${reportSchedules.length} schedule${reportSchedules.length === 1 ? "" : "s"}${nextRun ? ` · next delivery ${relativeDateTime(nextRun)}` : ""}` : "Loading schedules…",
    tax: `${monthName(period)} · ${branch}`,
    export: "Your business data, exportable at any time",
  };

  const counts: Record<string, number | null> = {
    all: library.data ? library.data.kpis.available : null,
    scheduled: schedules.data ? reportSchedules.length : null,
    tax: null,
    export: null,
  };

  useModuleHeader({
    title: TITLES[screen],
    subtitle: subtitles[screen],
    search: <HeaderSearch />,
    actions: <HeaderActions screen={screen} />,
  });

  return (
    <div className="flex min-h-full flex-col" style={{ background: R.page }}>
      <div className="nx-scroll" style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 24px", background: "#fff", borderBottom: `1px solid ${R.border}`, overflowX: "auto" }}>
        {TABS.map((t) => {
          const on = t.key === screen;
          const count = counts[t.key];
          return (
            <Link
              key={t.key}
              href={t.href}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 11px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", fontWeight: on ? 700 : 600, color: on ? R.ink : R.muted, boxShadow: on ? `inset 0 -2px 0 ${R.green}` : "none" }}
            >
              <RIcon name={t.icon} size={14} />
              <span>{t.label}</span>
              {count ? (
                <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, fontSize: 10.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "#DCFCE7" : "#F1F3F6", color: on ? "#15803D" : R.muted }}>{count}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
      <div style={{ padding: "18px 24px 30px", maxWidth: 1680, width: "100%", display: "flex", flexDirection: "column", gap: 18 }}>{children}</div>
      <ReportsOverlays />
    </div>
  );
}

export function ReportsShell({ children }: { children: ReactNode }) {
  const reset = useReports((s) => s.reset);
  useEffect(() => reset, [reset]);
  return <ShellContent>{children}</ShellContent>;
}
