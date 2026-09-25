"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchDigitizerStructured, type StructuredRow } from "@/lib/digitizer-api";
import { useDigitizerStore } from "../digitizer-store";
import { DIGITIZER_KEY } from "../digitizer-data";
import { Btn, Card, CardFooterNote, Chip, Empty, ErrorBlock, Kpi, KpiGrid, LEVEL_META, LoadingBlock, TableCard, Th, monoStyle, plural, theadStyle } from "../digitizer-ui";
import type { Tone } from "../digitizer-types";

const statusLabel = (r: StructuredRow): { text: string; tone: Tone } => {
  if (r.state === "imported") return { text: "Imported", tone: "green" };
  if (r.state === "skipped") return { text: "Skipped", tone: "neutral" };
  if (r.state === "ready") return { text: "Ready", tone: "green" };
  if (r.state === "needs_review") return { text: "Needs review", tone: "amber" };
  return { text: `Blocked · ${(r.stateReason ?? "needs attention").toLowerCase().slice(0, 34)}`, tone: "red" };
};

export function StructuredScreen() {
  const router = useRouter();
  const { openPanel, closePanel } = useDigitizerStore();
  const [group, setGroup] = useState<string>("all");
  const q = useQuery({ queryKey: [DIGITIZER_KEY, "structured", group], queryFn: () => fetchDigitizerStructured(group === "all" ? {} : { destination: group }) });

  if (q.isLoading) return <LoadingBlock label="Loading structured data…" />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const { kpis, groups, rows, truncated } = q.data;
  const total = groups.reduce((n, g) => n + g.count, 0);
  const pct = kpis.records ? Math.round((kpis.ready / kpis.records) * 100) : 0;

  const open = (r: StructuredRow) =>
    openPanel({
      kicker: "Structured record",
      title: r.record,
      badge: statusLabel(r).text,
      badgeTone: statusLabel(r).tone,
      rows: [
        [`Original value · ${r.fieldLabel || "—"}`, r.original ?? "—"],
        ["Normalized value", r.normalized ?? "—", r.normalized ? "pos" : "neg"],
        ["Normalization applied", r.normalization ?? "None — stored as read"],
        ...(r.row.fields.some((f) => f.kind === "phone" && f.normalization?.startsWith("Local format")) ? ([["Country code", "Taken from your business country — not from the document"]] as [string, string][]) : []),
        ["Confidence", LEVEL_META[r.level].label],
        ["Validation", r.validation.label, r.validation.tone === "red" ? "neg" : r.validation.tone === "green" ? "pos" : undefined],
        ["Duplicate", r.duplicate.label],
        ["Destination", r.destinationLabel],
        ["Source", `${r.documentName} · ${r.sourceLabel}`],
        ["Written anywhere", r.state === "imported" ? "Yes — imported" : "No", r.state === "imported" ? undefined : "pos"],
      ],
      bulletsTitle: "Both values are kept",
      bullets: ["The original value is stored beside the normalized one, always", "You can see exactly what changed and correct it in Review", "Nothing here has been written until an import is confirmed"],
      note: "Source, extracted, structured, corrected and imported are five distinct states.",
      primary: "Open in Review",
      onPrimary: () => {
        closePanel();
        router.push(`/digitizer/review?batch=${r.documentId}&row=${r.rowId}`);
      },
      secondary: "Close",
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <KpiGrid>
        <Kpi label="Records" value={String(kpis.records)} meta={`from ${plural(kpis.documents, "document")}`} />
        <Kpi label="Valid" value={String(kpis.valid)} meta="no issues" tone="green" />
        <Kpi label="Warnings" value={String(kpis.warnings)} meta="importable once you accept them" tone={kpis.warnings ? "amber" : "neutral"} />
        <Kpi label="Errors" value={String(kpis.errors)} meta="blocked until fixed" tone={kpis.errors ? "red" : "neutral"} />
        <Kpi label="Duplicates" value={String(kpis.duplicates)} meta="your decision" tone={kpis.duplicates ? "amber" : "neutral"} />
        <Kpi label="Ready" value={String(kpis.ready)} meta={`${pct}% of records`} tone="green" />
      </KpiGrid>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "14px", fontWeight: 800 }}>Records ready to become business data</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {[{ key: "all", label: "All", count: total }, ...groups.map((g) => ({ key: g.destination, label: g.label, count: g.count }))].map((g) => {
              const on = group === g.key;
              return (
                <div key={g.key} onClick={() => setGroup(g.key)} style={{ height: "30px", display: "flex", alignItems: "center", gap: "6px", padding: "0 11px", borderRadius: "999px", fontSize: "12px", fontWeight: on ? 700 : 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${on ? "#BBF0CB" : "#E1E5EB"}`, background: on ? "#ECFDF3" : "#fff", color: on ? "#15803D" : "#5B6675" }}>
                  {g.label}
                  <span style={{ fontSize: "10.5px", opacity: 0.7 }}>{g.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {rows.length === 0 ? (
          <Empty title="No structured records" icon="table-2" action={<Btn primary icon="camera" onClick={() => router.push("/digitizer/capture")}>Capture or upload a document</Btn>}>
            Records appear here once a document has been read and is waiting to be imported. Imported and failed documents are not listed.
          </Empty>
        ) : (
          <TableCard minWidth="1140px">
            <thead>
              <tr style={{ ...theadStyle, borderTop: "1px solid #EEF0F3" }}>
                <Th first>Record</Th>
                <Th>Original value</Th>
                <Th>Normalized</Th>
                <Th>Confidence</Th>
                <Th>Validation</Th>
                <Th>Duplicate</Th>
                <Th>Destination</Th>
                <Th>Source</Th>
                <Th last>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = statusLabel(r);
                const blocked = st.tone === "red";
                return (
                  <tr key={r.rowId} onClick={() => open(r)} style={{ borderBottom: "1px solid #F3F4F7", cursor: "pointer", background: blocked ? "#FEFBFB" : st.tone === "amber" ? "#FFFDF5" : "#fff" }}>
                    <td style={{ padding: "11px 12px 11px 18px", fontSize: "12.5px", fontWeight: 700 }}>
                      {r.record}
                      <div style={{ fontSize: "10px", color: "#94A3B8", fontWeight: 600, marginTop: "2px" }}>{r.documentName}</div>
                    </td>
                    <td style={{ padding: "11px 12px", fontSize: "11.5px", color: "#7A8798", ...monoStyle }}>
                      {r.original ?? "—"}
                      <div style={{ fontSize: "9.5px", color: "#94A3B8", fontFamily: "inherit" }}>{r.fieldLabel}</div>
                    </td>
                    <td style={{ padding: "11px 12px", fontSize: "11.5px", fontWeight: 700, ...monoStyle }}>
                      <span style={{ color: r.normalized ? "#0F172A" : "#B42318", fontStyle: r.normalized ? "normal" : "italic" }}>{r.normalized ?? "—"}</span>
                    </td>
                    <td style={{ padding: "11px 12px" }}><Chip tone={LEVEL_META[r.level].tone} style={{ height: "20px", fontSize: "9.5px" }}>{LEVEL_META[r.level].label}</Chip></td>
                    <td style={{ padding: "11px 12px" }}><Chip tone={r.validation.tone} style={{ height: "20px", fontSize: "9.5px" }}>{r.validation.label}</Chip></td>
                    <td style={{ padding: "11px 12px" }}><Chip tone={r.duplicate.level === "high" ? "amber" : "neutral"} style={{ height: "20px", fontSize: "9.5px" }}>{r.duplicate.label}</Chip></td>
                    <td style={{ padding: "11px 12px", fontSize: "11.5px", color: "#45505F" }}>{r.destinationLabel}</td>
                    <td style={{ padding: "11px 12px", fontSize: "10.5px", color: "#94A3B8", ...monoStyle }}>{r.sourceLabel}</td>
                    <td style={{ padding: "11px 18px 11px 12px" }}><Chip tone={st.tone} style={{ height: "20px", fontSize: "9.5px" }}>{st.text}</Chip></td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        )}
        <CardFooterNote>
          Original and normalized values are both shown, always. A normalization you cannot see is indistinguishable from an error you cannot see.
          {truncated ? " Showing the first 500 records — narrow by destination to see the rest." : ""}
        </CardFooterNote>
      </Card>
    </div>
  );
}
