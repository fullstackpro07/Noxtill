"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/session";
import {
  fetchReportsLibrary,
  fetchRunDetail,
  fetchRunExplanation,
  generateReport,
  parseReportRequest,
  sendRun,
  type AiBuilderResult,
} from "@/lib/reports-api";
import { REPORT_KIND_LABELS, type ReportKind } from "@/lib/reports";
import {
  createScheduledExport,
  deleteScheduledExport,
  fetchScheduledExports,
  updateScheduledExport,
  type ScheduleFrequency,
  type ScheduleRecipient,
} from "@/lib/scheduled-exports-api";
import { fetchTaxSummary, recordTaxFiling, setTaxFilingDay } from "@/lib/tax-reports-api";
import { createDataExport, fetchDataExportDetail, previewDataExport, regenerateDataExport, downloadDataExport } from "@/lib/data-exports-api";
import { FieldLabel, R, SCHEDULE_RUN_HOUR, WEEKDAYS, formatMoney2, formatBytes, hourLabel, inputStyle, monthName, ordinal, relativeDateTime, shortDate, shiftPeriod, currentPeriod, type Tone } from "./reports-ui";
import { PanelFrame } from "./reports-chrome";
import { useActiveBusinessName, useReports, type PanelState } from "./reports-context";

const errMsg = (e: unknown, fallback = "Please try again.") => (e instanceof ApiError ? e.message : fallback);

const selectStyle = { ...inputStyle, appearance: "auto" as const, cursor: "pointer" };

function useLibrary() {
  const { period } = useReports();
  return useQuery({ queryKey: ["reports", "library", period], queryFn: () => fetchReportsLibrary(period) });
}

// ---------------------------------------------------------------- Send

function SendPanel({ runId, name, periodLabel }: { runId: string; name: string; periodLabel: string }) {
  const { closeOverlays, notify } = useReports();
  const session = useSession();
  const branch = useActiveBusinessName();
  const qc = useQueryClient();
  const isOwner = session.user.role === "owner";
  const [mode, setMode] = useState<"me" | "other">("me");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const send = useMutation({
    mutationFn: () => sendRun(runId, mode === "other" ? { email: email.trim() || undefined, phone: phone.trim() || undefined } : undefined),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["reports", "run", runId] });
      void qc.invalidateQueries({ queryKey: ["reports", "library"] });
      closeOverlays();
      notify(`Report queued · ${r.channel ?? "channel"}`, `To ${r.recipient}. Its delivery state is read from the channel.`);
    },
    onError: (e) => notify("Couldn't send", errMsg(e)),
  });

  const invalidOther = mode === "other" && !email.trim() && !phone.trim();
  return (
    <PanelFrame
      kicker="Send report"
      title={`Send ${name}`}
      badge="Only connected channels"
      badgeTone="green"
      rows={[
        { label: "Report", value: name },
        { label: "Period", value: periodLabel },
        { label: "Branch", value: branch },
        { label: "Channel", value: "Chosen from what the recipient can receive" },
        { label: "Format", value: "Secure PDF link · 24 hours" },
      ]}
      bulletsTitle="Delivery honesty"
      bullets={[
        "States are queued, sent, delivered or failed — nothing beyond what the channel reports",
        "A failed send is shown with its reason, never dropped silently",
        "Sending a report to anyone but yourself is owner-only, enforced server-side",
      ]}
      note="Noxtill does not claim delivered, opened or downloaded unless the channel actually says so."
      primary={{ label: send.isPending ? "Sending…" : "Send", onClick: () => send.mutate(), disabled: send.isPending || invalidOther }}
      secondary="Cancel"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <FieldLabel>Recipient</FieldLabel>
        <div style={{ display: "flex", gap: 8 }}>
          {(
            [
              ["me", "Me"],
              ["other", "Someone else"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={key === "other" && !isOwner}
              onClick={() => setMode(key)}
              title={key === "other" && !isOwner ? "Only the owner can send a report to someone else" : undefined}
              style={{ height: 34, padding: "0 13px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: key === "other" && !isOwner ? "not-allowed" : "pointer", border: `1px solid ${mode === key ? R.green : R.btnBorder}`, background: mode === key ? R.greenSoft : "#fff", color: mode === key ? "#15803D" : R.text, opacity: key === "other" && !isOwner ? 0.5 : 1 }}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "other" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input aria-label="Recipient email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            <input aria-label="Recipient phone" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: R.muted }}>Sent to the contact on your own account.</div>
        )}
      </div>
    </PanelFrame>
  );
}

// ---------------------------------------------------------------- Explain

function ExplainPanel({ runId, name }: { runId: string; name: string }) {
  const router = useRouter();
  const { closeOverlays } = useReports();
  const q = useQuery({ queryKey: ["reports", "run", runId, "explain"], queryFn: () => fetchRunExplanation(runId) });
  const conf = q.data?.confidence;
  const tone: Tone = conf === "reconciled" ? "green" : conf === "warning" ? "amber" : "red";
  return (
    <PanelFrame
      kicker="Explain this report"
      title={`${name} · what changed and why`}
      badge={q.data ? `Confidence: ${conf === "reconciled" ? "high" : conf === "warning" ? "medium" : "low"}` : "Reading the data…"}
      badgeTone={q.data ? tone : "neutral"}
      answerLabel="Summary"
      answer={q.data?.summary ?? (q.isError ? errMsg(q.error, "This report could not be explained.") : null)}
      rows={q.data?.rows}
      bulletsTitle="How the explanation was built"
      bullets={q.data?.bullets}
      note={q.data?.note}
      primary={{
        label: "Open Analytics",
        onClick: () => {
          closeOverlays();
          router.push("/profit");
        },
      }}
    />
  );
}

// ---------------------------------------------------------------- AI builder + builder

function useGenerate() {
  const { openDrawer, notify, closeOverlays } = useReports();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: ReportKind; month: string; trigger?: "manual" | "ai_builder" }) => generateReport(v.kind, v.month, v.trigger),
    onSuccess: ({ run }) => {
      void qc.invalidateQueries({ queryKey: ["reports"] });
      closeOverlays();
      notify(`${REPORT_KIND_LABELS[run.kind]} v${run.version} generated`, "Validated against source records — see its Validation section.");
      openDrawer(run.id);
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ["reports"] });
      notify("Generation failed", errMsg(e));
    },
  });
}

function AiBuilderPanel({ initial }: { initial?: string }) {
  const branch = useActiveBusinessName();
  const [text, setText] = useState(initial ?? "");
  const [result, setResult] = useState<AiBuilderResult | null>(null);
  const generate = useGenerate();
  const { notify } = useReports();
  const parse = useMutation({
    mutationFn: () => parseReportRequest(text.trim()),
    onSuccess: setResult,
    onError: (e) => notify("Couldn't read that request", errMsg(e)),
  });

  const ok = result && result.supported ? result : null;
  return (
    <PanelFrame
      kicker="AI report builder"
      title={result ? "I understood your request as" : "Describe the report you want"}
      badge="Confirm before generating"
      badgeTone="purple"
      answerLabel="Your request"
      answer={result ? `“${result.request}”` : null}
      rows={
        ok
          ? [
              { label: "Report type", value: ok.name },
              { label: "Period", value: ok.periodLabel },
              { label: "Branch", value: branch },
              { label: "Permission check", value: ok.permissionNote, tone: ok.allowed ? "pos" : "neg" },
            ]
          : undefined
      }
      bulletsTitle={result ? (ok ? "Before it generates" : "Why this could not be built") : "What it can and cannot do"}
      bullets={
        result
          ? ok
            ? [
                "Every parameter above is shown for you to confirm — nothing important is assumed silently",
                "The report is validated and reconciled against source records before its result is recorded",
                "AI only chooses a report type and month; every number comes from your recorded data",
              ]
            : [result.supported ? "" : result.reason, "Supported reports: " + Object.values(REPORT_KIND_LABELS).join(", ") + ".", "Periods are whole calendar months."]
          : [
              "AI maps your words onto one of the report types Noxtill can build and reconcile",
              "Custom metrics, custom dimensions and week-level ranges are not supported — you are told so, not given an approximation",
            ]
      }
      note="AI drafts the definition. You approve it, and the numbers come from connected data only."
      primary={
        ok
          ? { label: generate.isPending ? "Generating…" : "Generate report", onClick: () => generate.mutate({ kind: ok.kind, month: ok.month, trigger: "ai_builder" }), disabled: generate.isPending || !ok.allowed }
          : { label: parse.isPending ? "Reading…" : "Interpret request", onClick: () => parse.mutate(), disabled: parse.isPending || text.trim().length < 3 }
      }
      secondary={ok ? "Cancel" : "Close"}
    >
      <div>
        <FieldLabel>Your request</FieldLabel>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          placeholder="top 20 products by profit this month"
          rows={3}
          style={{ ...inputStyle, height: "auto", padding: "10px 12px", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
        />
      </div>
    </PanelFrame>
  );
}

function BuilderPanel() {
  const lib = useLibrary();
  const generate = useGenerate();
  const { period } = useReports();
  const allowed = (lib.data?.reports ?? []).filter((r) => r.allowed);
  const [kind, setKind] = useState<ReportKind | "">("");
  const [month, setMonth] = useState(period);
  const chosen = kind || allowed[0]?.kind || "";
  const months = Array.from({ length: 12 }, (_, i) => shiftPeriod(currentPeriod(), -i));
  return (
    <PanelFrame
      kicker="Report builder"
      title="Build a report"
      badge="Supported reports only"
      badgeTone="neutral"
      bulletsTitle="What happens on generate"
      bullets={[
        "Permissions are checked before any data is read",
        "Required data is validated and the totals are reconciled against source records",
        "A snapshot stores the period and data state so you can see later what it represented",
        "Regenerating the same period adds a new version; it never overwrites",
      ]}
      note="Custom metrics, dimensions and free date ranges are not available. Only reports Noxtill can genuinely reconcile are offered."
      primary={{ label: generate.isPending ? "Generating…" : "Generate", onClick: () => chosen && generate.mutate({ kind: chosen, month }), disabled: generate.isPending || !chosen }}
      secondary="Cancel"
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <FieldLabel>Report type</FieldLabel>
          <select value={chosen} onChange={(e) => setKind(e.target.value as ReportKind)} style={selectStyle}>
            {allowed.map((r) => (
              <option key={r.kind} value={r.kind}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Period</FieldLabel>
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={selectStyle}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </PanelFrame>
  );
}

// ---------------------------------------------------------------- Failure

function FailurePanel({ runId }: { runId: string }) {
  const q = useQuery({ queryKey: ["reports", "run", runId], queryFn: () => fetchRunDetail(runId) });
  const generate = useGenerate();
  const d = q.data;
  const name = d ? (REPORT_KIND_LABELS[d.run.kind] ?? d.run.kind) : "Report";
  return (
    <PanelFrame
      kicker="Generation failure"
      title={`${name} could not be generated`}
      badge="Critical"
      badgeTone="red"
      rows={
        d
          ? [
              { label: "Report", value: name },
              { label: "Period", value: d.periodLabel },
              { label: "Failed at", value: relativeDateTime(d.run.generatedAt) },
              { label: "Trigger", value: d.run.trigger === "schedule" ? "Automated schedule" : d.run.trigger === "ai_builder" ? "AI report builder" : "Manual" },
              { label: "Reason", value: d.run.errorMessage ?? "—", tone: "neg" },
              { label: "Records read", value: "0" },
              { label: "Delivery", value: "Not attempted" },
            ]
          : undefined
      }
      bulletsTitle="What Noxtill did not do"
      bullets={[
        "It did not generate a partial report and present it as complete",
        "It did not estimate any figure to fill the gap",
        "It did not send anything to any recipient",
        "It kept the failed run in the history rather than hiding it",
      ]}
      note="Fix the cause above, then retry. Each attempt is recorded, whether it succeeds or fails."
      primary={d ? { label: generate.isPending ? "Retrying…" : "Retry", onClick: () => generate.mutate({ kind: d.run.kind, month: d.run.period }), disabled: generate.isPending, tone: "red" } : undefined}
      secondary="Close"
    />
  );
}

// ---------------------------------------------------------------- Schedules

function parseRecipients(text: string): ScheduleRecipient[] {
  return text
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.includes("@") ? { email: s } : { phone: s }));
}

function ScheduleNewPanel({ kind }: { kind?: ReportKind }) {
  const lib = useLibrary();
  const branch = useActiveBusinessName();
  const { closeOverlays, notify } = useReports();
  const qc = useQueryClient();
  const allowed = (lib.data?.reports ?? []).filter((r) => r.allowed);
  const [chosenKind, setChosenKind] = useState<ReportKind | "">(kind ?? "");
  const [frequency, setFrequency] = useState<ScheduleFrequency>("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [recipients, setRecipients] = useState("");
  const picked = chosenKind || allowed[0]?.kind || "";
  const existing = lib.data?.reports.find((r) => r.kind === picked)?.schedule;

  const create = useMutation({
    mutationFn: () =>
      createScheduledExport({
        reportKind: picked as ReportKind,
        frequency,
        dayOfWeek: frequency === "weekly" ? dayOfWeek : undefined,
        dayOfMonth: frequency === "monthly" ? dayOfMonth : undefined,
        recipients: parseRecipients(recipients),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reports"] });
      closeOverlays();
      notify("Schedule created", `${REPORT_KIND_LABELS[picked as ReportKind]} · ${frequency === "weekly" ? `every ${WEEKDAYS[dayOfWeek]}` : `on the ${ordinal(dayOfMonth)}`} at ${hourLabel(SCHEDULE_RUN_HOUR)}.`);
    },
    onError: (e) => notify("Couldn't create the schedule", errMsg(e)),
  });

  return (
    <PanelFrame
      kicker="New schedule"
      title="Schedule a report"
      badge="Runs at 6:00 AM server time"
      badgeTone="green"
      rows={[
        { label: "Branch", value: branch },
        { label: "Time", value: `${hourLabel(SCHEDULE_RUN_HOUR)} · the daily job's real run time` },
        { label: "Format", value: "PDF" },
        { label: "Period covered", value: frequency === "weekly" ? "The month so far" : "The previous full month" },
      ]}
      bulletsTitle="How it behaves"
      bullets={[
        "The first report is delivered on the schedule's first weekday or day of the month, not immediately",
        "Every run is recorded with its version and result, whether it succeeded or failed",
        "A failed run is retried by the next daily check and the failure reason is shown",
        "Recipients other than you receive a secure PDF link over the channel they can receive",
        ...(existing ? ["This report already has a schedule — creating another adds a second one"] : []),
      ]}
      note="Delivery states come from the channel. Opened and downloaded are never claimed."
      primary={{ label: create.isPending ? "Creating…" : "Create schedule", onClick: () => create.mutate(), disabled: create.isPending || !picked }}
      secondary="Cancel"
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <FieldLabel>Report</FieldLabel>
          <select value={picked} onChange={(e) => setChosenKind(e.target.value as ReportKind)} style={selectStyle}>
            {allowed.map((r) => (
              <option key={r.kind} value={r.kind}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Frequency</FieldLabel>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)} style={selectStyle}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <FieldLabel>{frequency === "weekly" ? "Day of the week" : "Day of the month"}</FieldLabel>
          {frequency === "weekly" ? (
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} style={selectStyle}>
              {WEEKDAYS.map((w, i) => (
                <option key={w} value={i}>
                  {w}
                </option>
              ))}
            </select>
          ) : (
            <select value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} style={selectStyle}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {ordinal(n)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <FieldLabel>Recipients</FieldLabel>
          <input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="Emails or phone numbers, separated by commas — leave empty to be notified in Noxtill" style={inputStyle} />
        </div>
      </div>
    </PanelFrame>
  );
}

function ScheduleDetailPanel({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["reports", "schedules"], queryFn: fetchScheduledExports });
  const branch = useActiveBusinessName();
  const { closeOverlays, notify, openDrawer, openConfirm } = useReports();
  const qc = useQueryClient();
  const s = q.data?.find((x) => x.id === id);
  const refresh = () => qc.invalidateQueries({ queryKey: ["reports"] });

  const toggle = useMutation({
    mutationFn: () => updateScheduledExport(id, { active: !s?.active }),
    onSuccess: () => {
      void refresh();
      closeOverlays();
      notify(s?.active ? "Schedule paused" : "Schedule resumed", s?.active ? "Future runs stop. History and the schedule are kept." : "It will run on its next scheduled day.");
    },
    onError: (e) => notify("Couldn't update the schedule", errMsg(e)),
  });

  if (!s) {
    return <PanelFrame kicker="Schedule" title="Loading…" />;
  }
  const name = s.reportKind ? REPORT_KIND_LABELS[s.reportKind] : `${s.kind} export`;
  const when = s.frequency === "weekly" ? (s.dayOfWeek !== null ? `Weekly · ${WEEKDAYS[s.dayOfWeek]}` : "Weekly") : s.dayOfMonth !== null ? `Monthly · ${ordinal(s.dayOfMonth)}` : "Monthly";
  return (
    <PanelFrame
      kicker="Schedule"
      title={name}
      badge={s.active ? "Active" : "Paused"}
      badgeTone={s.active ? "green" : "amber"}
      rows={[
        { label: "Report", value: name },
        { label: "Period covered", value: s.periodLabel ?? "—" },
        { label: "Frequency", value: `${when} ${hourLabel(s.runHour)}` },
        { label: "Branch", value: branch },
        { label: "Recipients", value: s.recipients.length > 0 ? s.recipients.map((r) => r.label ?? r.email ?? r.phone).join(", ") : "Notified in Noxtill" },
        { label: "Format", value: s.format.toUpperCase() },
        { label: "Next run", value: s.nextRunAt ? relativeDateTime(s.nextRunAt) : "Paused" },
        { label: "Last run", value: s.lastRunAt ? relativeDateTime(s.lastRunAt) : "Never" },
        { label: "Last result", value: s.lastResult === "sent" ? "Sent" : s.lastResult === "failed" ? `Failed · ${s.lastError ?? "no reason recorded"}` : "Not run yet", tone: s.lastResult === "failed" ? "neg" : undefined },
        { label: "Created", value: shortDate(s.createdAt) },
      ]}
      bulletsTitle="Run history"
      bullets={[
        s.lastResult === "failed" ? "The last run failed before delivery — the failure is kept, not hidden, and the next daily check retries it" : "Every run is recorded with its generated version, delivery state and result",
        "Run now generates one extra report and leaves this schedule's timing untouched",
        "Pausing stops future runs; the schedule and its history remain",
      ]}
      note="Delivery states come from the channel. Opened and downloaded are not claimed unless reported."
      primary={{ label: toggle.isPending ? "Saving…" : s.active ? "Pause schedule" : "Resume schedule", onClick: () => toggle.mutate(), disabled: toggle.isPending }}
      secondary="Close"
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {s.lastReportRunId ? (
          <button type="button" onClick={() => openDrawer(s.lastReportRunId!)} style={{ height: 30, padding: "0 10px", borderRadius: 8, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Open last report
          </button>
        ) : null}
        <button
          type="button"
          onClick={() =>
            openConfirm({
              title: `Delete this ${name} schedule?`,
              tone: "red",
              icon: "triangle-alert",
              body: "The schedule stops and is removed. Reports it already generated, and their versions, are kept.",
              primary: "Delete schedule",
              cancel: "Keep it",
              onConfirm: async () => {
                try {
                  await deleteScheduledExport(id);
                  void refresh();
                  closeOverlays();
                  notify("Schedule deleted", "Generated reports were kept.");
                } catch (e) {
                  notify("Couldn't delete the schedule", errMsg(e));
                }
              },
            })
          }
          style={{ height: 30, padding: "0 10px", borderRadius: 8, border: "1px solid #FBD5D2", background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#B42318" }}
        >
          Delete schedule
        </button>
      </div>
    </PanelFrame>
  );
}

// ---------------------------------------------------------------- Tax

function TaxRecordPanel({ period }: { period: string }) {
  const { closeOverlays, notify } = useReports();
  const qc = useQueryClient();
  const tax = useQuery({ queryKey: ["reports", "tax", period], queryFn: () => fetchTaxSummary(period) });
  const session = useSession();
  const [filedOn, setFiledOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const record = useMutation({
    mutationFn: () => recordTaxFiling({ period, filedOn, reference: reference.trim() || undefined, notes: notes.trim() || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reports", "tax"] });
      closeOverlays();
      notify("Recorded as filed", `${monthName(period)} · recorded with your name and the date you entered.`);
    },
    onError: (e) => notify("Couldn't record this", errMsg(e)),
  });
  return (
    <PanelFrame
      kicker="Record as filed"
      title="Record that you filed this return"
      badge="Your record, not Noxtill's action"
      badgeTone="amber"
      rows={[
        { label: "Period", value: monthName(period) },
        { label: "Tax collected", value: tax.data ? formatMoney2(tax.data.kpis.netTax, tax.data.currency) : "…" },
        { label: "Filed by", value: session.user.name },
      ]}
      bulletsTitle="What this does"
      bullets={[
        "It records in Noxtill that you filed this return, with the date and reference you enter",
        "It does not submit anything to any tax authority",
        "It does not confirm the return was accepted or that the figures are correct",
        "The tax collected at this moment is stored with the record, so it can be compared later",
      ]}
      note="Noxtill prepares tax reporting. Filing remains yours."
      primary={{ label: record.isPending ? "Recording…" : "Record as filed", onClick: () => record.mutate(), disabled: record.isPending || !filedOn }}
      secondary="Cancel"
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <FieldLabel>Filed date</FieldLabel>
          <input type="date" value={filedOn} onChange={(e) => setFiledOn(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <FieldLabel>Reference number (optional)</FieldLabel>
          <input value={reference} onChange={(e) => setReference(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <FieldLabel>Notes (optional)</FieldLabel>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} />
        </div>
      </div>
    </PanelFrame>
  );
}

function TaxSettingsPanel() {
  const { period, closeOverlays, notify } = useReports();
  const qc = useQueryClient();
  const tax = useQuery({ queryKey: ["reports", "tax", period], queryFn: () => fetchTaxSummary(period) });
  const [day, setDay] = useState<number | null>(null);
  const value = day ?? tax.data?.filing.day ?? 15;
  const save = useMutation({
    mutationFn: () => setTaxFilingDay(value),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reports", "tax"] });
      closeOverlays();
      notify("Filing date saved", `Reminders now count from the ${ordinal(value)} of each month.`);
    },
    onError: (e) => notify("Couldn't save the filing date", errMsg(e)),
  });
  return (
    <PanelFrame
      kicker="Tax filing date"
      title="When do you file each month?"
      badge="Owner only"
      badgeTone="neutral"
      bulletsTitle="What this is"
      bullets={[
        "This is the day of the month you told Noxtill you file — Noxtill does not know your statutory deadline",
        "It is used only to show the next filing date and to time your reminder",
        "Days 1–28 are offered so every month has the date",
      ]}
      note="Noxtill reminds you. It does not track statutory deadlines on your behalf or confirm they are correct."
      primary={{ label: save.isPending ? "Saving…" : "Save filing date", onClick: () => save.mutate(), disabled: save.isPending }}
      secondary="Cancel"
    >
      <div style={{ maxWidth: 220 }}>
        <FieldLabel>Day of the month</FieldLabel>
        <select value={value} onChange={(e) => setDay(Number(e.target.value))} style={selectStyle}>
          {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {ordinal(n)}
            </option>
          ))}
        </select>
      </div>
    </PanelFrame>
  );
}

const ISSUE_EXPLAIN: Record<string, { bulletsTitle: string; bullets: string[]; note: string; effect: string; fix: string }> = {
  "no-rate": {
    bulletsTitle: "Why this is not filled in automatically",
    bullets: [
      "Assuming a missing rate is zero would understate your tax",
      "Assuming it is the standard rate would overstate it for genuinely exempt items",
      "Either assumption would be Noxtill making a tax decision on your behalf",
      "The sales are listed on their own line so you can set the correct rate at the source",
    ],
    note: "Noxtill will not invent a tax rate, a tax category or a liability.",
    effect: "Their tax collected is unknown, not zero — they are not counted in the tax collected total",
    fix: "Products · tax configuration",
  },
  refunds: {
    bulletsTitle: "Why these are shown but not netted",
    bullets: [
      "An approved return records the refund amount, not how much of it was tax",
      "Netting the full amount would understate tax collected",
      "The count and amount are shown so you can adjust in your own return",
    ],
    note: "Noxtill will not guess the tax share of a refund.",
    effect: "Shown for information only — not deducted from net tax",
    fix: "Not applicable — a recording gap, not an error to fix",
  },
  purchases: {
    bulletsTitle: "Why this is empty",
    bullets: [
      "No supplier invoice or expense in Noxtill records the tax paid",
      "So input tax cannot be calculated and is not shown as zero",
      "Net tax therefore equals tax collected; deduct your input tax in your own return",
    ],
    note: "Noxtill will not invent a figure it has no record of.",
    effect: "Net tax shown is tax collected only",
    fix: "Not tracked — enter input tax in your own return",
  },
};

function TaxIssuePanel({ issueKey }: { issueKey: string }) {
  const { period } = useReports();
  const tax = useQuery({ queryKey: ["reports", "tax", period], queryFn: () => fetchTaxSummary(period) });
  const issue = tax.data?.issues.find((i) => i.key === issueKey);
  const info = ISSUE_EXPLAIN[issueKey] ?? ISSUE_EXPLAIN.purchases;
  return (
    <PanelFrame
      kicker="Tax validation"
      title={issue?.title ?? "Tax validation"}
      badge={issue?.meta}
      badgeTone={issue?.tone ?? "neutral"}
      rows={
        issue
          ? [
              { label: "Issue", value: issue.title },
              { label: "Affected", value: String(issue.count) },
              { label: "Period", value: tax.data?.periodLabel ?? "" },
              { label: "Effect on the figures", value: info.effect },
              { label: "Auto-corrected", value: "No" },
              { label: "Where to fix it", value: info.fix },
            ]
          : undefined
      }
      bulletsTitle={info.bulletsTitle}
      bullets={info.bullets}
      note={info.note}
    />
  );
}

// ---------------------------------------------------------------- Data export

function ExportPreviewPanel({ request }: { request: import("@/lib/data-exports-api").DataExportRequest }) {
  const { closeOverlays, notify } = useReports();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["reports", "export", "preview", request], queryFn: () => previewDataExport(request) });
  const create = useMutation({
    mutationFn: () => createDataExport(request),
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ["reports", "export"] });
      closeOverlays();
      notify(`${row.displayId} queued`, "It runs in the background. The download link works for 24 hours after it is ready.");
    },
    onError: (e) => notify("Couldn't create the export", errMsg(e)),
  });
  const p = q.data;
  return (
    <PanelFrame
      kicker="Export preview"
      title="Before anything is generated"
      badge={p ? `${p.modules.length} module${p.modules.length === 1 ? "" : "s"}` : "Counting…"}
      badgeTone="neutral"
      rows={
        p
          ? [
              { label: "Modules", value: p.modules.map((m) => m.label).join(", ") },
              { label: "Records", value: p.records.toLocaleString("en-US") },
              { label: "Date range", value: "All data" },
              { label: "Sensitive columns", value: p.sensitive ? "Included · owner only" : "None selected" },
              { label: "Format", value: p.format === "csv" ? "CSV per module, in a ZIP" : "Excel workbook, one sheet per module" },
              { label: "Link expiry", value: "24 hours after it is ready" },
            ]
          : undefined
      }
      bulletsTitle="File quality"
      bullets={[
        "One CSV per module with a header row and consistent columns, or one Excel sheet per module",
        "Excel exports use real data types, not everything in one column",
        "Nothing is generated until you confirm",
      ]}
      note="Restrictions are enforced server-side. A non-owner reaching this dialog would still be refused."
      primary={{ label: create.isPending ? "Creating…" : "Confirm export", onClick: () => create.mutate(), disabled: create.isPending || !p }}
      secondary="Cancel"
    />
  );
}

function ExportJobPanel({ id }: { id: string }) {
  const { notify, closeOverlays } = useReports();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["reports", "export", "job", id], queryFn: () => fetchDataExportDetail(id) });
  const d = q.data;
  const tone: Tone = d?.status === "ready" ? "green" : d?.status === "failed" ? "red" : d?.status === "expired" ? "neutral" : "blue";
  const action = useMutation({
    mutationFn: async () => {
      if (d?.status === "ready") {
        const { url } = await downloadDataExport(id);
        window.open(url, "_blank", "noopener");
        return "download" as const;
      }
      await regenerateDataExport(id);
      return "regenerate" as const;
    },
    onSuccess: (what) => {
      void qc.invalidateQueries({ queryKey: ["reports", "export"] });
      if (what === "regenerate") {
        closeOverlays();
        notify("Regenerating", "Same scope and format, as a new export.");
      } else notify("Download started", "The link is valid until this export expires.");
    },
    onError: (e) => notify("Couldn't do that", errMsg(e)),
  });
  const label = d?.status === "ready" ? "Download" : d?.status === "expired" || d?.status === "failed" ? "Regenerate" : null;
  return (
    <PanelFrame
      kicker="Export job"
      title={d ? `${d.displayId} · ${d.scopeLabel}` : "Loading…"}
      badge={d ? d.status[0].toUpperCase() + d.status.slice(1) : undefined}
      badgeTone={tone}
      rows={
        d
          ? [
              { label: "Requested by", value: d.requestedBy ?? "—" },
              { label: "Created", value: relativeDateTime(d.createdAt) },
              { label: "Modules", value: d.modules.join(", ") },
              { label: "Format", value: d.format === "csv" ? "CSV in a ZIP" : "Excel workbook" },
              { label: "Records", value: d.status === "ready" || d.status === "expired" ? d.records.toLocaleString("en-US") : "—" },
              { label: "Size", value: d.sizeBytes ? formatBytes(d.sizeBytes) : "—" },
              { label: "Status", value: d.status },
              { label: "Expiry", value: d.expiresAt ? relativeDateTime(d.expiresAt) : "—" },
              { label: "Sensitive data", value: d.sensitive ? "Yes · owner only" : "No" },
              ...(d.errorMessage ? [{ label: "Failure reason", value: d.errorMessage, tone: "neg" as const }] : []),
              ...d.audit.map((a) => ({ label: a.action.replace("data_export.", ""), value: `${relativeDateTime(a.at)}${a.actorName ? ` · ${a.actorName}` : ""}` })),
            ]
          : undefined
      }
      bulletsTitle="Job states"
      bullets={[
        "Queued, preparing, ready, failed or expired — no invented progress percentage while it runs",
        "A ready export offers a secure link that expires 24 hours after it is generated",
        "An expired or failed export can be regenerated with the same scope",
        "Every export is logged with who ran it and whether it included sensitive columns",
      ]}
      note="Deleting an export file never deletes any business data."
      primary={label ? { label: action.isPending ? "Working…" : label, onClick: () => action.mutate(), disabled: action.isPending } : undefined}
      secondary="Close"
    />
  );
}

// ---------------------------------------------------------------- host

export function PanelHost({ panel }: { panel: PanelState }) {
  switch (panel.type) {
    case "send":
      return <SendPanel key={panel.runId} runId={panel.runId} name={panel.name} periodLabel={panel.periodLabel} />;
    case "explain":
      return <ExplainPanel key={panel.runId} runId={panel.runId} name={panel.name} />;
    case "ai":
      return <AiBuilderPanel initial={panel.request} />;
    case "builder":
      return <BuilderPanel />;
    case "failure":
      return <FailurePanel runId={panel.runId} />;
    case "schedule-new":
      return <ScheduleNewPanel kind={panel.kind} />;
    case "schedule":
      return <ScheduleDetailPanel id={panel.id} />;
    case "tax-record":
      return <TaxRecordPanel period={panel.period} />;
    case "tax-issue":
      return <TaxIssuePanel issueKey={panel.issueKey} />;
    case "tax-settings":
      return <TaxSettingsPanel />;
    case "export-job":
      return <ExportJobPanel id={panel.id} />;
    case "export-preview":
      return <ExportPreviewPanel request={panel.request} />;
    case "tax-row":
      return <TaxRowPanel row={panel.row} />;
    case "static":
      return <PanelFrame {...panel.spec} />;
  }
}

function TaxRowPanel({ row }: { row: import("@/lib/tax-reports-api").TaxRow }) {
  const { period } = useReports();
  const tax = useQuery({ queryKey: ["reports", "tax", period], queryFn: () => fetchTaxSummary(period) });
  const currency = tax.data?.currency ?? "USD";
  const money = (n: number | null) => (n === null ? "Unknown" : formatMoney2(n, currency));
  const unrated = row.ratePercent === null;
  const tone: Tone = row.statusTone === "green" ? "green" : row.statusTone === "red" ? "red" : row.statusTone === "blue" ? "blue" : "neutral";
  return (
    <PanelFrame
      kicker="Tax period"
      title={`${row.periodLabel} · ${row.rateLabel}`}
      badge={row.status}
      badgeTone={tone}
      rows={[
        { label: "Taxable amount", value: money(row.taxable) },
        { label: "Tax rate", value: row.rateLabel },
        { label: "Tax collected", value: money(row.collected), tone: unrated ? "neg" : undefined },
        { label: "Tax on purchases", value: "Not tracked" },
        { label: "Transactions", value: String(row.orders) },
        { label: "Calculation", value: unrated ? "Not calculated — no rate was recorded" : "Sum of the tax charged on each line at this rate" },
        { label: "Status", value: row.status },
      ]}
      bulletsTitle={unrated ? "Why these are separated" : "Source records"}
      bullets={
        unrated
          ? [
              "These sales have no tax rate recorded against their lines",
              "They are shown on their own line so the gap is visible in your totals",
              "Noxtill will not decide whether they are exempt or standard-rated",
              "Set the rate on the product to have future sales counted at it",
            ]
          : [
              "Every figure traces to completed sales in the period",
              row.status === "Recorded as filed" ? "You recorded this as filed — Noxtill did not submit it" : "Recording a filing is your own note; Noxtill files nothing",
            ]
      }
      note="Noxtill prepares tax reporting from recorded sales. It is not a legal determination of what you owe."
    />
  );
}
