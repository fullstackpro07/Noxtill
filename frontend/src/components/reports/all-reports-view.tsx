"use client";

import { useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { downloadRun, fetchReportsLibrary, generateReport, toggleReportFavorite, type LibraryReport } from "@/lib/reports-api";
import {
  BannerCard,
  ErrorCard,
  Kpi,
  KpiGrid,
  KpiSkeletons,
  R,
  RIcon,
  ageLabel,
  chipStyle,
  filterBtnStyle,
  primaryBtnStyle,
  relativeDateTime,
  validationIcon,
  validationLabel,
  validationTone,
  type Tone,
} from "./reports-ui";
import { useReports } from "./reports-context";
import { freshness, generatedByLabel } from "./report-drawer";

type StatusFilter = "all" | "ready" | "failed" | "none";

const selectShell: CSSProperties = {
  ...filterBtnStyle,
  position: "relative",
  paddingRight: 8,
};

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const active = value !== "all";
  return (
    <label style={{ ...selectShell, borderColor: active ? R.green : R.btnBorder, background: active ? R.greenSoft : "#fff" }}>
      <RIcon name="filter" size={13} />
      <span>{label}</span>
      <select
        aria-label={`Filter by ${label.toLowerCase()}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReportCard({ report, periodLabel, period }: { report: LibraryReport; periodLabel: string; period: string }) {
  const { openDrawer, openViewer, openPanel, openConfirm, notify } = useReports();
  const router = useRouter();
  const qc = useQueryClient();
  const latest = report.latest;
  const failed = latest?.status === "failed";
  const fresh = latest ? freshness(latest) : null;
  const vTone = validationTone(latest?.validationStatus);

  const refresh = () => qc.invalidateQueries({ queryKey: ["reports"] });
  const generate = useMutation({
    mutationFn: () => generateReport(report.kind, period),
    onSuccess: ({ run }) => {
      void refresh();
      notify(`${report.name} v${run.version} generated`, "Validated against source records — see its Validation section.");
    },
    onError: (e) => {
      void refresh();
      notify(`${report.name} failed to generate`, e instanceof ApiError ? e.message : "Please try again.");
    },
  });
  const download = useMutation({
    mutationFn: () => downloadRun(latest!.id),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener");
      notify(`Downloaded · ${report.name}`, "PDF ready · secure link expires in 24 hours.");
    },
    onError: (e) => notify("Couldn't download", e instanceof ApiError ? e.message : "Please try again."),
  });
  const favorite = useMutation({
    mutationFn: () => toggleReportFavorite(report.kind),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["reports", "library"] });
      notify(r.favorite ? "Added to favourites" : "Removed from favourites", report.name);
    },
  });

  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const open = () => {
    if (latest) return openDrawer(latest.id);
    openConfirm({
      title: `Generate ${report.name}?`,
      tone: "green",
      icon: "file-text",
      body: "The report is computed from your recorded data, validated and reconciled, and stored as version 1 for this period.",
      rows: [
        { label: "Period", value: periodLabel },
        { label: "Sources", value: report.description },
      ],
      primary: "Generate",
      cancel: "Cancel",
      onConfirm: async () => {
        await generate.mutateAsync().catch(() => undefined);
      },
    });
  };

  const actions: { label: string; icon: string; danger?: boolean; primary?: boolean; disabled?: boolean; run: () => void }[] = failed
    ? [
        { label: "View failure", icon: "circle-alert", danger: true, run: () => openPanel({ type: "failure", runId: latest!.id }) },
        { label: generate.isPending ? "Retrying…" : "Retry", icon: "history", disabled: generate.isPending, run: () => generate.mutate() },
      ]
    : latest
      ? [
          { label: "Preview", icon: "eye", run: () => openViewer(latest.id) },
          { label: "Download", icon: "download", disabled: download.isPending, run: () => download.mutate() },
          { label: "Send", icon: "send", run: () => openPanel({ type: "send", runId: latest.id, name: report.name, periodLabel }) },
          { label: "Schedule", icon: "calendar-clock", run: () => (router.push("/reports/scheduled"), openPanel({ type: "schedule-new", kind: report.kind })) },
        ]
      : [
          { label: generate.isPending ? "Generating…" : "Generate", icon: "file-text", primary: true, disabled: generate.isPending, run: () => generate.mutate() },
          { label: "Schedule", icon: "calendar-clock", run: () => (router.push("/reports/scheduled"), openPanel({ type: "schedule-new", kind: report.kind })) },
        ];

  const statusTone: Tone = failed ? "red" : latest ? "green" : "neutral";
  const small = { height: 20, fontSize: 9.5 };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => (e.key === "Enter" ? open() : undefined)}
      style={{ background: "#fff", borderRadius: 13, padding: 16, cursor: "pointer", boxShadow: "0 1px 2px rgba(16,24,40,.04)", border: `1px solid ${failed ? "#FBD5D2" : R.border}`, transition: "border-color .12s, box-shadow .12s" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = R.green;
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(16,24,40,.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = failed ? "#FBD5D2" : R.border;
        e.currentTarget.style.boxShadow = "0 1px 2px rgba(16,24,40,.04)";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
        <div style={{ width: 34, height: 34, flex: "0 0 34px", borderRadius: 10, background: failed ? "#FEE4E2" : latest ? "#DCFCE7" : "#F1F3F6", color: failed ? "#B42318" : latest ? "#15803D" : R.label, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <RIcon name={report.icon} size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, textWrap: "pretty" }}>{report.name}</div>
          <div style={{ fontSize: 10.5, color: R.faint, marginTop: 3, lineHeight: 1.45 }}>{report.description}</div>
        </div>
        <button
          type="button"
          aria-label={report.favorite ? "Remove from favourites" : "Add to favourites"}
          aria-pressed={report.favorite}
          onClick={stop(() => favorite.mutate())}
          style={{ width: 26, height: 26, flex: "0 0 26px", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: 0, background: "transparent", color: report.favorite ? "#F59E0B" : "#C3CAD4" }}
        >
          <RIcon name="star" size={14} style={{ fill: report.favorite ? "#F59E0B" : "none" }} />
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 11, flexWrap: "wrap" }}>
        <span style={chipStyle(statusTone, small)}>
          <RIcon name={failed ? "circle-alert" : latest ? "circle-check" : "clock-3"} size={11} />
          {failed ? "Failed" : latest ? "Ready" : "Not generated"}
        </span>
        {fresh ? (
          <span style={chipStyle(fresh.tone, small)}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", flex: "0 0 6px", background: fresh.tone === "green" ? "#16A34A" : fresh.tone === "amber" ? "#F59E0B" : "#DC2626" }} />
            {fresh.text}
          </span>
        ) : null}
        {latest ? (
          <span style={chipStyle(vTone, small)}>
            <RIcon name={validationIcon(latest.validationStatus)} size={11} />
            {validationLabel(latest.validationStatus ?? (failed ? "critical" : null))}
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 12, paddingTop: 11, borderTop: `1px solid ${R.rowLine}`, flexWrap: "wrap" }}>
        {[
          ["Period", periodLabel],
          ["Generated", latest ? relativeDateTime(latest.generatedAt) : "—"],
          ["Version", latest && !failed ? `v${latest.version}` : "—"],
        ].map(([label, value]) => (
          <div key={label}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: R.faint }}>{label}</div>
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            disabled={a.disabled}
            onClick={stop(a.run)}
            style={{ height: 30, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: a.disabled ? "wait" : "pointer", whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${a.danger ? "#FBD5D2" : a.primary ? R.green : R.btnBorder}`, background: a.primary ? R.green : "#fff", color: a.danger ? "#B42318" : a.primary ? "#fff" : R.text, opacity: a.disabled ? 0.6 : 1 }}
          >
            <RIcon name={a.icon} size={13} />
            {a.label}
          </button>
        ))}
      </div>
      {latest && report.runsInPeriod > 1 ? (
        <div style={{ fontSize: 10, color: R.faint, marginTop: 9 }}>
          {report.runsInPeriod} versions this period · last by {generatedByLabel(latest)}
        </div>
      ) : null}
    </div>
  );
}

export function AllReportsView() {
  const { period, openDrawer, openPanel } = useReports();
  const router = useRouter();
  const q = useQuery({ queryKey: ["reports", "library", period], queryFn: () => fetchReportsLibrary(period) });
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState<StatusFilter | string>("all");
  const [scheduled, setScheduled] = useState("all");
  const [by, setBy] = useState("all");

  const visible = useMemo(() => (q.data?.reports ?? []).filter((r) => r.allowed), [q.data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return visible.filter((r) => {
      if (type !== "all" && r.kind !== type) return false;
      const st = r.latest ? r.latest.status : "none";
      if (status !== "all" && st !== status) return false;
      if (scheduled === "yes" && !r.schedule) return false;
      if (scheduled === "no" && r.schedule) return false;
      if (by !== "all") {
        const t = r.latest?.trigger;
        if (by === "manual" ? t !== "manual" : by === "automated" ? t !== "schedule" : t !== "ai_builder") return false;
      }
      if (term) {
        const hay = [r.name, r.kind, r.description, q.data?.periodLabel, r.latest?.generatedByName, r.latest ? `v${r.latest.version}` : "", r.latest?.id].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [visible, search, type, status, scheduled, by, q.data?.periodLabel]);

  const k = q.data?.kpis;
  // A report worth a look: the latest run this period whose validation is not clean.
  const attention = visible
    .map((r) => r.latest)
    .filter((l): l is NonNullable<LibraryReport["latest"]> => !!l && l.status === "ready" && (l.validationStatus === "warning" || l.validationStatus === "critical"))
    .sort((a, b) => (a.validationStatus === "critical" ? -1 : 0) - (b.validationStatus === "critical" ? -1 : 0))[0];
  const attentionReport = attention ? visible.find((r) => r.latest?.id === attention.id) : undefined;

  if (q.isError) return <ErrorCard message={q.error instanceof ApiError ? q.error.message : "The reports library could not be loaded."} onRetry={() => void q.refetch()} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {!k ? (
        <KpiSkeletons count={7} />
      ) : (
        <KpiGrid>
          <Kpi label="Reports available" value={String(k.available)} meta={`${k.ready} ready, ${k.failed} failed`} />
          <Kpi label="Generated this month" value={String(k.generatedThisMonth)} meta={`${k.automatedThisMonth} automated`} />
          <Kpi label="Scheduled" value={String(k.scheduled)} meta={k.nextScheduled ? `next ${relativeDateTime(k.nextScheduled.at)}` : "none scheduled"} onClick={() => router.push("/reports/scheduled")} />
          <Kpi label="Sent" value={String(k.sent)} meta={k.sentChannels.length ? k.sentChannels.join(" and ") : "none sent this month"} />
          <Kpi
            label="Failed"
            value={String(k.failed)}
            meta={k.failed ? `${k.failedNames.join(", ")} · generation error` : "none this period"}
            tone={k.failed ? "red" : "neutral"}
            onClick={() => {
              const f = visible.find((r) => r.latest?.status === "failed");
              if (f?.latest) openPanel({ type: "failure", runId: f.latest.id });
            }}
          />
          <Kpi label="Most used" value={k.mostUsed?.name ?? "—"} meta={k.mostUsed ? `${k.mostUsed.count} generation${k.mostUsed.count === 1 ? "" : "s"} in 90 days` : "nothing generated yet"} />
          <Kpi label="Most recent" value={k.mostRecent?.name ?? "—"} meta={k.mostRecent ? `${relativeDateTime(k.mostRecent.at)} · ${ageLabel(k.mostRecent.at)}` : "nothing generated yet"} />
        </KpiGrid>
      )}

      {attention && attentionReport ? (
        <BannerCard
          tone="purple"
          icon="lightbulb"
          title={`Review ${attentionReport.name} — ${attention.validationStatus === "critical" ? "totals do not reconcile" : "generated with exclusions"}`}
          text={
            attention.validationStatus === "critical"
              ? "Its total differs from an independent recomputation from source records. Nothing was corrected — open it to see exactly where."
              : `${attention.exclusionsCount} item${attention.exclusionsCount === 1 ? " was" : "s were"} left out of a calculation for missing data and named in the report rather than estimated.`
          }
        >
          <button type="button" onClick={() => openDrawer(attention.id, "Validation")} style={{ ...primaryBtnStyle, fontSize: 12.5 }}>
            Open report
          </button>
        </BannerCard>
      ) : null}

      <div style={{ background: "#fff", border: `1px solid ${R.border}`, borderRadius: 13, boxShadow: R.shadow, padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <label style={{ height: 34, flex: "1 1 220px", minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "0 11px", border: `1px solid ${R.btnBorder}`, borderRadius: 10, background: "#fff" }}>
          <RIcon name="search" size={14} style={{ color: R.label }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search report name, type, ID, period or generated by…"
            style={{ flex: 1, minWidth: 0, border: 0, outline: "none", fontSize: 12.5, background: "transparent", color: R.ink }}
          />
        </label>
        <FilterSelect label="Type" value={type} onChange={setType} options={[{ value: "all", label: "All types" }, ...visible.map((r) => ({ value: r.kind, label: r.name }))]} />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Any status" },
            { value: "ready", label: "Ready" },
            { value: "failed", label: "Failed" },
            { value: "none", label: "Not generated" },
          ]}
        />
        <FilterSelect
          label="Scheduled"
          value={scheduled}
          onChange={setScheduled}
          options={[
            { value: "all", label: "Scheduled or not" },
            { value: "yes", label: "Scheduled" },
            { value: "no", label: "Not scheduled" },
          ]}
        />
        <FilterSelect
          label="Generated by"
          value={by}
          onChange={setBy}
          options={[
            { value: "all", label: "Anyone" },
            { value: "manual", label: "Manually" },
            { value: "automated", label: "Automated schedule" },
            { value: "ai", label: "AI report builder" },
          ]}
        />
      </div>

      {!q.data ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 14 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} style={{ background: "#fff", border: `1px solid ${R.border}`, borderRadius: 13, height: 210 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "#fff", border: `1px solid ${R.border}`, borderRadius: 13, padding: "40px 20px", textAlign: "center", fontSize: 12.5, color: R.muted }}>No report matches these filters.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 14 }}>
          {filtered.map((r) => (
            <ReportCard key={r.kind} report={r} periodLabel={q.data.periodLabel} period={period} />
          ))}
        </div>
      )}
    </div>
  );
}
