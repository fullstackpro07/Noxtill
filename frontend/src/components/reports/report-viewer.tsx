"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { downloadRun, fetchRunDetail } from "@/lib/reports-api";
import { REPORT_KIND_LABELS } from "@/lib/reports";
import { R, RIcon, relativeDateTime } from "./reports-ui";
import { useActiveBusinessName, useReports } from "./reports-context";
import { generatedByLabel } from "./report-drawer";

const TH: React.CSSProperties = { padding: "7px 8px", fontSize: 9.5, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", color: R.text };

/** The document viewer: the exact stored snapshot the PDF is rendered from, laid out as a page. */
export function ReportViewer() {
  const { viewerRunId, closeViewer, openPanel, notify } = useReports();
  const branch = useActiveBusinessName();
  const detail = useQuery({ queryKey: ["reports", "run", viewerRunId], queryFn: () => fetchRunDetail(viewerRunId ?? ""), enabled: !!viewerRunId });
  const download = useMutation({
    mutationFn: () => downloadRun(viewerRunId ?? ""),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener");
      notify("PDF ready", "Secure link expires in 24 hours.");
    },
    onError: (e) => notify("Couldn't download", e instanceof ApiError ? e.message : "Please try again."),
  });

  if (!viewerRunId) return null;
  const d = detail.data;
  const snap = d?.snapshot ?? null;
  const run = d?.run;
  const name = run ? (REPORT_KIND_LABELS[run.kind] ?? run.kind) : "";
  const generated = run ? relativeDateTime(run.generatedAt) : "";
  const maxBar = snap?.bars ? Math.max(...snap.bars.bars.map((b) => b.value), 1) : 1;

  const actions: { label: string; icon: string; primary?: boolean; onClick: () => void }[] = [
    { label: "Download", icon: "download", primary: true, onClick: () => download.mutate() },
    { label: "Send", icon: "send", onClick: () => d && openPanel({ type: "send", runId: d.run.id, name, periodLabel: d.periodLabel }) },
    { label: "Ask AI", icon: "sparkles", onClick: () => d && openPanel({ type: "explain", runId: d.run.id, name }) },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 160, background: "#2A3444", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 20px", background: R.navy, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#fff" }}>{name || "Report"}</div>
          <div style={{ fontSize: 10.5, color: "#8E9BAF", marginTop: 2 }}>
            {d && run ? `${d.periodLabel} · ${branch} · generated ${generated} · v${run.version}` : " "}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: "auto", flexWrap: "wrap" }}>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              disabled={!d}
              style={{ height: 30, display: "flex", alignItems: "center", gap: 6, padding: "0 11px", borderRadius: 8, cursor: "pointer", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, border: 0, background: a.primary ? R.green : "rgba(255,255,255,.08)", color: a.primary ? "#fff" : "#A4B1C4" }}
            >
              <RIcon name={a.icon} size={14} />
              {a.label}
            </button>
          ))}
          <button type="button" onClick={closeViewer} aria-label="Close preview" style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#A4B1C4", cursor: "pointer", border: 0, background: "transparent" }}>
            <RIcon name="x" size={16} strokeWidth={2.25} />
          </button>
        </div>
      </div>

      <div className="nx-scroll" style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 820, background: "#fff", borderRadius: 4, boxShadow: "0 18px 44px rgba(0,0,0,.28)", padding: "40px 44px", alignSelf: "flex-start" }}>
          {detail.isError ? (
            <div style={{ fontSize: 12.5, color: "#B42318" }}>{detail.error instanceof ApiError ? detail.error.message : "This report could not be loaded."}</div>
          ) : !snap || !run || !d ? (
            <div style={{ fontSize: 12.5, color: R.label }}>{detail.isLoading ? "Loading…" : "This run has no document — it failed to generate."}</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, paddingBottom: 20, borderBottom: `2px solid ${R.navy}` }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: R.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, flexShrink: 0 }}>N</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{branch}</div>
                  <div style={{ fontSize: 11, color: R.label, marginTop: 2 }}>{snap.currency} · prepared by Noxtill</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: R.faint }}>Report</div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 3 }}>{name}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 24, marginTop: 18, flexWrap: "wrap" }}>
                {[
                  ["Period", d.periodLabel],
                  ["Branch", branch],
                  ["Generated", generated],
                  ["Generated by", generatedByLabel(run)],
                  ["Version", `v${run.version}`],
                  ["Records", snap.recordsCount.toLocaleString("en-US")],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: R.faint }}>{label}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 3 }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 24, padding: 16, border: `1px solid ${R.border}`, borderRadius: 8, background: "#FAFBFC" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: R.faint }}>Executive summary</div>
                <div style={{ fontSize: 12.5, color: R.ink, lineHeight: 1.65, marginTop: 8, textWrap: "pretty" }}>{snap.summary}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginTop: 22 }}>
                {snap.kpis.map((k) => {
                  const good = k.deltaDir === "flat" ? null : k.deltaDir === "up" ? k.upIsGood !== false : k.upIsGood === false;
                  return (
                    <div key={k.label} style={{ border: `1px solid ${R.border}`, borderRadius: 8, padding: 13 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: R.faint }}>{k.label}</div>
                      <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.03em", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{k.display}</div>
                      {k.delta ? (
                        <div style={{ fontSize: 10, fontWeight: 700, marginTop: 4, color: good === null ? R.faint : good ? "#15803D" : "#B42318" }}>{k.delta}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {snap.bars && snap.bars.bars.length > 0 ? (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{snap.bars.title}</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, marginTop: 14 }}>
                    {snap.bars.bars.map((b) => (
                      <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: "100%", gap: 5 }}>
                        <div style={{ width: "100%", height: `${Math.max((b.value / maxBar) * 100, 2)}%`, borderRadius: "3px 3px 0 0", background: R.green, opacity: 0.85 }} />
                        <div style={{ fontSize: 9, color: R.faint }}>{b.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {snap.table ? (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{snap.table.title}</div>
                  {snap.table.rows.length === 0 ? (
                    <div style={{ fontSize: 11.5, color: R.muted, marginTop: 11 }}>{snap.table.emptyText}</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${R.navy}` }}>
                          {snap.table.columns.map((c) => (
                            <th key={c.key} style={{ ...TH, textAlign: c.align }}>
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {snap.table.rows.map((row, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${R.divider}` }}>
                            {snap.table!.columns.map((c, ci) => (
                              <td key={c.key} style={{ padding: 8, textAlign: c.align, fontSize: 11.5, fontWeight: ci === 0 ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>
                                {row[c.key]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}

              <div style={{ marginTop: 26, paddingTop: 14, borderTop: `1px solid ${R.border}` }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: R.faint }}>Notes and definitions</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
                  {snap.footnotes.map((f, i) => (
                    <div key={i} style={{ fontSize: 10.5, color: R.muted, lineHeight: 1.5, textWrap: "pretty" }}>
                      {f}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 10, color: R.faint }}>{`Generated by Noxtill · ${generated} · v${run.version}`}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
