"use client";

import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/session";
import {
  createDataExport,
  downloadDataExport,
  fetchDataExportOverview,
  regenerateDataExport,
  type DataExportFormat,
  type DataExportRow,
  type DataExportState,
} from "@/lib/data-exports-api";
import { CardEmpty, ErrorCard, Kpi, KpiGrid, KpiSkeletons, R, RIcon, cardShellStyle, chipStyle, dayMonth, formatBytes, primaryBtnStyle, relativeDateTime, smallBtnStyle, thStyle, type Tone } from "./reports-ui";
import { useActiveBusinessName, useReports } from "./reports-context";

const MODULE_ICON: Record<string, string> = {
  customers: "users-round",
  sales: "shopping-cart",
  products: "package",
  stock: "boxes",
  credit: "credit-card",
  expenses: "receipt-text",
};

const STATUS: Record<DataExportState, { label: string; tone: Tone; icon: string }> = {
  queued: { label: "Queued", tone: "blue", icon: "clock-3" },
  preparing: { label: "Preparing", tone: "blue", icon: "clock-3" },
  ready: { label: "Ready", tone: "green", icon: "circle-check" },
  failed: { label: "Failed", tone: "red", icon: "circle-alert" },
  expired: { label: "Expired", tone: "neutral", icon: "circle-alert" },
};

function expiryText(row: DataExportRow): string {
  if (row.status === "ready" && row.expiresAt) {
    const hours = Math.max(0, Math.round((new Date(row.expiresAt).getTime() - Date.now()) / 3_600_000));
    return hours >= 1 ? `Expires in ${hours} h` : "Expires within the hour";
  }
  if (row.status === "expired" && row.expiresAt) return `Expired ${dayMonth(row.expiresAt)}`;
  return "—";
}

export function DataExportView() {
  const { openPanel, openConfirm, notify } = useReports();
  const session = useSession();
  const branch = useActiveBusinessName();
  const qc = useQueryClient();
  const isOwner = session.user.role === "owner";
  const q = useQuery({
    queryKey: ["reports", "export", "overview"],
    queryFn: fetchDataExportOverview,
    enabled: isOwner,
    refetchInterval: (query) => (query.state.data?.history.some((h) => h.status === "queued" || h.status === "preparing") ? 3000 : false),
  });
  const [selected, setSelected] = useState<string[] | null>(null);
  const [format, setFormat] = useState<DataExportFormat>("csv");

  const download = useMutation({
    mutationFn: (id: string) => downloadDataExport(id),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener");
      notify("Download started", "The link is valid until this export expires.");
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ["reports", "export"] });
      notify("Couldn't download", e instanceof ApiError ? e.message : "Please try again.");
    },
  });
  const regenerate = useMutation({
    mutationFn: (id: string) => regenerateDataExport(id),
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ["reports", "export"] });
      notify(`${row.displayId} queued`, "Regenerating with the same scope and format.");
    },
    onError: (e) => notify("Couldn't regenerate", e instanceof ApiError ? e.message : "Please try again."),
  });

  if (!isOwner) {
    return <CardEmpty icon="shield-check" title="Only an owner can export business data" text="Exports include credit balances, expenses and customer contact details. The restriction is enforced on the server, so it cannot be bypassed from this screen." />;
  }
  if (q.isError) return <ErrorCard message={q.error instanceof ApiError ? q.error.message : "Export information could not be loaded."} onRetry={() => void q.refetch()} />;

  const d = q.data;
  const modules = d?.modules ?? [];
  const chosen = selected ?? [];
  const chosenModules = modules.filter((m) => chosen.includes(m.key));
  const chosenRecords = chosenModules.reduce((n, m) => n + m.records, 0);
  const sensitive = chosenModules.filter((m) => m.sensitive);
  const k = d?.kpis;

  const create = async (scope: "everything" | "selected", keys: string[]) => {
    try {
      const row = await createDataExport({ scope, modules: scope === "selected" ? keys : undefined, format });
      void qc.invalidateQueries({ queryKey: ["reports", "export"] });
      notify(`${row.displayId} queued`, "It runs in the background. The download link works for 24 hours after it is ready.");
      if (scope === "selected") setSelected([]);
    } catch (e) {
      notify("Couldn't create the export", e instanceof ApiError ? e.message : "Please try again.");
    }
  };

  const exportEverything = () => {
    if (!d) return;
    const sens = d.modules.filter((m) => m.sensitive).map((m) => m.label);
    openConfirm({
      title: "Export everything?",
      tone: "amber",
      icon: "database",
      body: `You are exporting ${d.modules.length} modules and ${d.totalRecords.toLocaleString("en-US")} records. This includes ${sens.join(", ").toLowerCase()}. ${format === "csv" ? "The file is a ZIP with one CSV per module" : "The file is an Excel workbook with one sheet per module"} and the link expires 24 hours after it is ready.`,
      rows: [
        { label: "Modules", value: String(d.modules.length) },
        { label: "Records", value: d.totalRecords.toLocaleString("en-US") },
        { label: "Format", value: format === "csv" ? "CSV per module, in a ZIP" : "Excel workbook" },
        { label: "Sensitive data", value: sens.join(", ") },
        { label: "Your role", value: "Owner · authorised" },
        { label: "Recorded in audit", value: "Yes" },
      ],
      primary: "Confirm export",
      cancel: "Cancel",
      onConfirm: () => create("everything", []),
    });
  };

  const createSelected = () =>
    openConfirm({
      title: "Create this export?",
      tone: "amber",
      icon: "file-down",
      body: `You are exporting ${chosenModules.length} module${chosenModules.length === 1 ? "" : "s"} and ${chosenRecords.toLocaleString("en-US")} records.${sensitive.length ? " Your selection includes sensitive business information." : ""} The export runs in the background and the download link expires 24 hours after it is ready.`,
      rows: [
        { label: "Modules", value: chosenModules.map((m) => m.label).join(", ") },
        { label: "Records", value: chosenRecords.toLocaleString("en-US") },
        { label: "Format", value: format === "csv" ? "CSV per module, in a ZIP" : "Excel workbook" },
        { label: "Link expiry", value: "24 hours after ready" },
        { label: "Recorded in audit", value: "Yes" },
      ],
      primary: "Confirm export",
      cancel: "Cancel",
      onConfirm: () => create("selected", chosen),
    });

  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ ...cardShellStyle, borderColor: R.greenLine, padding: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ width: 38, height: 38, flex: "0 0 38px", borderRadius: 11, background: R.greenSoft, color: "#15803D", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <RIcon name="database" size={19} />
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800 }}>This is your data</div>
          <div style={{ fontSize: 12, color: R.muted, marginTop: 4, lineHeight: 1.55, textWrap: "pretty" }}>
            Export what Noxtill holds for your business, at any time, in open formats. No lock-in, no negotiation, no support ticket.
          </div>
        </div>
        <button type="button" disabled={!d} onClick={exportEverything} style={{ ...primaryBtnStyle, height: 40, gap: 8, padding: "0 16px", borderRadius: 10, fontSize: 13.5, fontWeight: 800 }}>
          <RIcon name="file-down" size={16} />
          Export everything
        </button>
      </div>

      {!k ? (
        <KpiSkeletons count={5} />
      ) : (
        <KpiGrid>
          <Kpi label="Last export" value={k.lastExport ? dayMonth(k.lastExport.at) : "None yet"} meta={k.lastExport ? `by ${k.lastExport.by ?? "—"}` : "nothing exported"} />
          <Kpi label="Records exported" value={k.lastExport ? k.lastExport.records.toLocaleString("en-US") : "—"} meta="in that export" />
          <Kpi label="Data size" value={k.lastExport ? formatBytes(k.lastExport.sizeBytes) : "—"} meta="of that export" />
          <Kpi label="Current jobs" value={String(k.current.count)} meta={k.current.state ?? "none running"} />
          <Kpi label="Failed exports" value={String(k.failedLast90Days)} meta="last 90 days" tone={k.failedLast90Days ? "red" : "neutral"} />
        </KpiGrid>
      )}

      <div style={{ ...cardShellStyle, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Export selected</div>
          <div style={{ marginLeft: "auto", fontSize: 11, color: R.faint }}>{chosenModules.length} module{chosenModules.length === 1 ? "" : "s"} selected</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 210px), 1fr))", gap: 10, marginTop: 14 }}>
          {modules.map((m) => {
            const on = chosen.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setSelected(on ? chosen.filter((x) => x !== m.key) : [...chosen, m.key])}
                style={{ border: `1px solid ${on ? R.greenLine : R.border}`, borderRadius: 11, padding: "11px 12px", cursor: "pointer", background: on ? "#F9FEFB" : "#fff", textAlign: "left" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 17, height: 17, flex: "0 0 17px", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", background: on ? R.green : "#fff", border: `1px solid ${on ? R.green : "#C3CAD4"}` }}>
                    {on ? <RIcon name="check" size={11} strokeWidth={2.25} /> : null}
                  </div>
                  <RIcon name={MODULE_ICON[m.key] ?? "file-text"} size={14} style={{ color: m.sensitive ? "#B45309" : R.label }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: R.faint, marginTop: 1 }}>{m.records.toLocaleString("en-US")} {m.records === 1 ? "record" : "records"}</div>
                  </div>
                </div>
                {m.sensitive ? (
                  <div style={{ ...chipStyle("amber"), height: 19, fontSize: 9, marginTop: 8 }}>Sensitive</div>
                ) : null}
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 11, marginTop: 16, paddingTop: 15, borderTop: `1px solid ${R.divider}` }}>
          {[
            ["Date range", "All data"],
            ["Branch", branch],
            ["Attachments", "Not included"],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: R.text, marginBottom: 6 }}>{label}</div>
              <div style={{ height: 40, display: "flex", alignItems: "center", padding: "0 12px", border: `1px solid ${R.btnBorder}`, borderRadius: 10, background: "#FAFBFC", fontSize: 12.5, color: R.muted }}>{value}</div>
            </div>
          ))}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: R.text, marginBottom: 6 }}>Format</div>
            <label style={{ height: 40, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", border: `1px solid ${R.btnBorder}`, borderRadius: 10, background: "#fff", cursor: "pointer", position: "relative" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(d?.formats ?? []).find((f) => f.key === format)?.label ?? "CSV per module, in a ZIP"}</span>
              <RIcon name="chevron-down" size={14} style={{ color: R.label }} />
              <select aria-label="Export format" value={format} onChange={(e) => setFormat(e.target.value as DataExportFormat)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}>
                {(d?.formats ?? [{ key: "csv", label: "CSV per module, in a ZIP" }]).map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {sensitive.length > 0 ? (
          <div style={{ border: "1px solid #FDE49B", background: "#FFFBEB", borderRadius: 11, padding: 12, marginTop: 15, display: "flex", gap: 9 }}>
            <RIcon name="shield-check" size={15} style={{ color: "#B45309", marginTop: 1 }} />
            <div style={{ fontSize: 11.5, color: "#B45309", lineHeight: 1.5, textWrap: "pretty" }}>
              Your selection includes {sensitive.map((m) => m.label.toLowerCase()).join(", ")}. Only an owner can export these, the restriction is enforced server-side, and the export is recorded in the audit trail with who ran it.
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, marginTop: 15, flexWrap: "wrap" }}>
          <button type="button" disabled={chosenModules.length === 0} onClick={() => openPanel({ type: "export-preview", request: { scope: "selected", modules: chosen, format } })} style={{ ...smallBtnStyle, opacity: chosenModules.length === 0 ? 0.5 : 1 }}>
            Preview export
          </button>
          <button type="button" disabled={chosenModules.length === 0} onClick={createSelected} style={{ ...primaryBtnStyle, height: 30, borderRadius: 8, padding: "0 11px", fontSize: 12, opacity: chosenModules.length === 0 ? 0.5 : 1 }}>
            Create export
          </button>
        </div>
      </div>

      <div style={{ ...cardShellStyle, overflow: "hidden" }}>
        <div style={{ padding: "15px 18px", borderBottom: `1px solid ${R.divider}`, fontSize: 14, fontWeight: 800 }}>Export history</div>
        <div className="nx-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1080, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderBottom: `1px solid ${R.border}` }}>
                <th style={{ ...thStyle("left"), paddingLeft: 18 }}>Export ID</th>
                <th style={thStyle("left")}>Requested by</th>
                <th style={thStyle("left")}>Date</th>
                <th style={thStyle("left")}>Scope</th>
                <th style={thStyle("center")}>Modules</th>
                <th style={thStyle("right")}>Records</th>
                <th style={thStyle("right")}>Size</th>
                <th style={thStyle("left")}>Status</th>
                <th style={thStyle("left")}>Expiry</th>
                <th style={{ ...thStyle("right"), paddingRight: 18 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!d ? (
                <tr>
                  <td colSpan={10} style={{ padding: 28, textAlign: "center", fontSize: 12.5, color: R.faint }}>
                    Loading export history…
                  </td>
                </tr>
              ) : d.history.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: "34px 18px", textAlign: "center", fontSize: 12.5, color: R.muted }}>
                    No export yet. Choose modules above, or export everything.
                  </td>
                </tr>
              ) : (
                d.history.map((h) => {
                  const st = STATUS[h.status];
                  const active = h.status === "queued" || h.status === "preparing";
                  const action = h.status === "ready" ? "Download" : active ? "View" : "Regenerate";
                  const run = () => {
                    if (action === "Download") download.mutate(h.id);
                    else if (action === "Regenerate") regenerate.mutate(h.id);
                    else openPanel({ type: "export-job", id: h.id });
                  };
                  return (
                    <tr key={h.id} onClick={() => openPanel({ type: "export-job", id: h.id })} style={{ borderBottom: `1px solid ${R.rowLine}`, cursor: "pointer", background: active ? "#F7FBFF" : "#fff" }}>
                      <td style={{ padding: "11px 12px 11px 18px", fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{h.displayId}</td>
                      <td style={{ padding: "11px 12px", fontSize: 12, color: R.text }}>{h.requestedBy ?? "—"}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.faint }}>{relativeDateTime(h.createdAt)}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.text }}>{h.scopeLabel}</td>
                      <td style={{ padding: "11px 12px", textAlign: "center", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{h.moduleCount}</td>
                      <td style={{ padding: "11px 12px", textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{h.status === "ready" || h.status === "expired" ? h.records.toLocaleString("en-US") : "—"}</td>
                      <td style={{ padding: "11px 12px", textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{h.sizeBytes ? formatBytes(h.sizeBytes) : "—"}</td>
                      <td style={{ padding: "11px 12px" }}>
                        <span style={chipStyle(st.tone, { height: 21, fontSize: 10 })}>
                          <RIcon name={st.icon} size={11} />
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.faint }}>{expiryText(h)}</td>
                      <td style={{ padding: "11px 18px 11px 12px", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={stop(run)}
                          style={{ height: 30, display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", background: action === "Download" ? R.green : "#fff", color: action === "Download" ? "#fff" : R.text, border: `1px solid ${action === "Download" ? R.green : R.btnBorder}` }}
                        >
                          {action}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${R.divider}`, background: "#FCFCFD", fontSize: 11, color: R.faint }}>
          Secure download links expire 24 hours after the export is ready — that is the actual policy, enforced when a link is requested. An expired export can be regenerated.
        </div>
      </div>
    </div>
  );
}
