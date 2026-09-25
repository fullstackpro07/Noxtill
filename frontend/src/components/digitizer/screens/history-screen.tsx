"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchDigitizerDocuments } from "@/lib/digitizer-api";
import { DigitizerIcon } from "../digitizer-icon";
import { useDigitizerStore } from "../digitizer-store";
import { DIGITIZER_KEY } from "../digitizer-data";
import { Btn, Card, CardFooterNote, Chip, DocThumb, Empty, ErrorBlock, KIND_ICON, Kpi, KpiGrid, LoadingBlock, STATUS_META, StatusChip, TableCard, Th, plural, theadStyle, whenLabel } from "../digitizer-ui";

const PAGE = 50;
const STATUS_OPTIONS: [string, string][] = [
  ["all", "Any status"],
  ["open", "Open (needs action)"],
  ["needs_review", "Needs review"],
  ["ready", "Ready to import"],
  ["imported", "Imported"],
  ["failed", "Failed"],
  ["processing", "Processing"],
  ["queued", "Queued"],
];

const select: CSSProperties = { height: "34px", border: "1px solid #D5DAE2", borderRadius: "10px", padding: "0 10px", fontSize: "12.5px", fontWeight: 700, background: "#fff", color: "#0F172A", flexShrink: 0 };

export function HistoryScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { openDoc } = useDigitizerStore();

  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const [kind, setKind] = useState(params.get("kind") ?? "");
  const [destination, setDestination] = useState("");
  const [uploaderId, setUploaderId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);

  // Debounce typing so the list is not re-fetched on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(text.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [text]);

  const query = { status: status === "all" ? undefined : status, kind: kind || undefined, destination: destination || undefined, uploaderId: uploaderId || undefined, from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined, q: search || undefined, limit: PAGE, offset };
  const q = useQuery({ queryKey: [DIGITIZER_KEY, "documents", query], queryFn: () => fetchDigitizerDocuments(query), placeholderData: keepPreviousData });

  if (q.isLoading) return <LoadingBlock label="Loading history…" />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const { items, total, kpis, filters, capped } = q.data;
  const filtered = Boolean(status !== "all" || kind || destination || uploaderId || from || to || search);
  const reset = () => {
    setText("");
    setStatus("all");
    setKind("");
    setDestination("");
    setUploaderId("");
    setFrom("");
    setTo("");
    setOffset(0);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <KpiGrid min={160}>
        <Kpi label="Processed" value={String(kpis.processed)} meta="documents read, all time" />
        <Kpi label="Imported" value={String(kpis.imported)} meta={`${plural(kpis.recordsWritten, "record")} written`} tone="green" onClick={() => { setStatus("imported"); setOffset(0); }} />
        <Kpi label="Failed" value={String(kpis.failed)} meta="with reasons kept" tone={kpis.failed ? "red" : "neutral"} onClick={() => { setStatus("failed"); setOffset(0); }} />
        <Kpi label="Needs review" value={String(kpis.needsReview)} meta="still open" tone={kpis.needsReview ? "amber" : "neutral"} onClick={() => { setStatus("needs_review"); setOffset(0); }} />
        <Kpi label="Originals kept" value={String(kpis.retained)} meta="stored exactly as uploaded" />
      </KpiGrid>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ height: "34px", flex: "1 1 220px", minWidth: 0, display: "flex", alignItems: "center", gap: "8px", padding: "0 11px", border: "1px solid #D5DAE2", borderRadius: "10px", background: "#fff" }}>
            <DigitizerIcon name="search" size={14} style={{ color: "#7A8798" }} />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search document name, type, destination or uploader…" style={{ flex: 1, minWidth: 0, fontSize: "12.5px", color: "#0F172A", border: "none", outline: "none", background: "transparent" }} />
            {text && (
              <div onClick={() => setText("")} style={{ cursor: "pointer", color: "#7A8798", display: "flex", alignItems: "center" }}>
                <DigitizerIcon name="x" size={13} />
              </div>
            )}
          </div>
          <select style={select} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} aria-label="Status">
            {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select style={select} value={kind} onChange={(e) => { setKind(e.target.value); setOffset(0); }} aria-label="Type">
            <option value="">Any type</option>
            {filters.kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <select style={select} value={destination} onChange={(e) => { setDestination(e.target.value); setOffset(0); }} aria-label="Destination">
            <option value="">Any destination</option>
            {filters.destinations.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          <select style={select} value={uploaderId} onChange={(e) => { setUploaderId(e.target.value); setOffset(0); }} aria-label="Uploader">
            <option value="">Any uploader</option>
            {filters.uploaders.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <input type="date" style={select} value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setOffset(0); }} aria-label="From date" />
          <input type="date" style={select} value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setOffset(0); }} aria-label="To date" />
          {filtered && <Btn onClick={reset}>Clear filters</Btn>}
        </div>

        {items.length === 0 ? (
          <Empty title={filtered ? "No documents match these filters" : "No documents yet"} icon="history" action={filtered ? <Btn onClick={reset}>Clear filters</Btn> : <Btn primary icon="camera" onClick={() => router.push("/digitizer/capture")}>Capture or upload</Btn>} />
        ) : (
          <TableCard minWidth="1140px">
            <thead>
              <tr style={{ ...theadStyle, borderTop: "1px solid #EEF0F3" }}>
                <Th first>Document</Th>
                <Th>Type</Th>
                <Th>Uploaded</Th>
                <Th>By</Th>
                <Th>Destination</Th>
                <Th align="center">Records</Th>
                <Th>Version</Th>
                <Th>Original</Th>
                <Th>Status</Th>
                <Th align="right" last>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => {
                const m = STATUS_META[d.status];
                return (
                  <tr key={d.id} onClick={() => openDoc(d.id)} style={{ borderBottom: "1px solid #F3F4F7", cursor: "pointer", background: m.tone === "red" ? "#FEFBFB" : m.tone === "amber" ? "#FFFDF5" : "#fff" }}>
                    <td style={{ padding: "11px 12px 11px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                        <DocThumb icon={KIND_ICON[d.kind]} tone={m.tone} />
                        <div style={{ fontSize: "12.5px", fontWeight: 700 }}>{d.name}</div>
                      </div>
                    </td>
                    <td style={{ padding: "11px 12px", fontSize: "12px", color: "#45505F" }}>{d.kindLabel}</td>
                    <td style={{ padding: "11px 12px", fontSize: "11.5px", color: "#94A3B8" }}>{whenLabel(d.uploadedAt)}</td>
                    <td style={{ padding: "11px 12px", fontSize: "11.5px", color: "#45505F" }}>{d.uploadedBy?.name ?? "—"}</td>
                    <td style={{ padding: "11px 12px", fontSize: "12px", color: "#45505F" }}>{d.destinations.map((x) => x.label).join(" · ") || "Not determined"}</td>
                    <td style={{ padding: "11px 12px", textAlign: "center", fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{d.counts.rows}</td>
                    <td style={{ padding: "11px 12px" }}><Chip tone={d.version > 1 ? "blue" : "neutral"} style={{ height: "20px", fontSize: "9.5px" }}>v{d.version}</Chip></td>
                    <td style={{ padding: "11px 12px" }}><Chip tone={d.originalRetained ? "green" : "red"} style={{ height: "20px", fontSize: "9.5px" }}>{d.originalRetained ? "Preserved" : "Missing"}</Chip></td>
                    <td style={{ padding: "11px 12px" }}><StatusChip status={d.status} style={{ height: "21px", fontSize: "10px" }} /></td>
                    <td style={{ padding: "11px 18px 11px 12px", textAlign: "right" }}>
                      <Btn onClick={(e) => { e.stopPropagation(); openDoc(d.id); }}>Open</Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        )}

        {total > PAGE && (
          <div style={{ padding: "11px 18px", borderTop: "1px solid #EEF0F3", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "11.5px", color: "#7A8798" }}>{offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: "7px" }}>
              <Btn disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Btn>
              <Btn disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Next</Btn>
            </div>
          </div>
        )}
        <CardFooterNote>
          Reprocessing creates a new version rather than overwriting the previous one, so a correction you made is never silently discarded.
          {capped ? " Showing the most recent 500 documents." : ""}
        </CardFooterNote>
      </Card>
    </div>
  );
}
