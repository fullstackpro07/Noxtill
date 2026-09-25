"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchDigitizerQueue, type DocStatus, type DocumentSummary } from "@/lib/digitizer-api";
import { DigitizerIcon } from "../digitizer-icon";
import { useDigitizerStore } from "../digitizer-store";
import { busyInterval, DIGITIZER_KEY } from "../digitizer-data";
import { Btn, Card, CardFooterNote, Chip, DocThumb, Empty, ErrorBlock, KIND_ICON, Kpi, KpiGrid, LoadingBlock, STATUS_META, StatusChip, TableCard, Th, durationLabel, pagesLabel, theadStyle, toneOfSummary, whenLabel } from "../digitizer-ui";

const stageText = (d: DocumentSummary): string => {
  const s: DocStatus = d.status;
  if (s === "queued") return "Queued";
  if (s === "processing") return `${d.stage ?? "processing"} · running`.replace(/^./, (c) => c.toUpperCase());
  if (s === "failed") return "Read failed";
  if (s === "total_mismatch" || s === "unbalanced") return "Validation · blocked";
  if (s === "imported") return "Import · complete";
  return "Validation · complete";
};

export function QueueScreen() {
  const router = useRouter();
  const { openDoc, openPanel, closePanel, notify } = useDigitizerStore();
  const q = useQuery({
    queryKey: [DIGITIZER_KEY, "queue"],
    queryFn: fetchDigitizerQueue,
    refetchInterval: (query) => busyInterval((query.state.data?.kpis.processing ?? 0) + (query.state.data?.kpis.queued ?? 0)),
  });

  // Tick once a second so "elapsed" is live between polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (q.isLoading) return <LoadingBlock label="Loading the queue…" />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const { kpis, inProgress, documents, pipeline } = q.data;

  const actionOf = (d: DocumentSummary): { label: string; primary: boolean; run: () => void } => {
    if (d.status === "failed") return { label: "Retake", primary: false, run: () => router.push("/digitizer/capture") };
    if (d.status === "imported") return { label: "View", primary: false, run: () => openDoc(d.id) };
    if (d.status === "ready") return { label: "Import", primary: true, run: () => router.push(`/digitizer/import?doc=${d.id}`) };
    if (d.status === "queued" || d.status === "processing") return { label: "Open", primary: false, run: () => openDoc(d.id) };
    return { label: "Review", primary: false, run: () => router.push(`/digitizer/review?batch=${d.id}`) };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <KpiGrid min={160}>
        <Kpi label="Queued" value={String(kpis.queued)} meta={kpis.queued ? "waiting to start" : "nothing waiting"} onClick={() => notify(`Queued · ${kpis.queued}`, "Uploaded and waiting for the reader to pick them up.")} />
        <Kpi label="Processing" value={String(kpis.processing)} meta="file check, extraction, validation" tone="blue" onClick={() => notify(`Processing · ${kpis.processing}`, "The reader is working on these right now.")} />
        <Kpi label="Ready" value={String(kpis.ready)} meta={`${kpis.cleanRecords} clean record${kpis.cleanRecords === 1 ? "" : "s"}`} tone="green" onClick={() => router.push("/digitizer/history?status=ready")} />
        <Kpi label="Needs review" value={String(kpis.needsReview)} meta={`${kpis.rowsNeedHuman} row${kpis.rowsNeedHuman === 1 ? "" : "s"}`} tone={kpis.needsReview ? "amber" : "neutral"} onClick={() => router.push("/digitizer/review")} />
        <Kpi label="Failed" value={String(kpis.failed)} meta={kpis.failed ? "reason kept on each" : "none"} tone={kpis.failed ? "red" : "neutral"} onClick={() => router.push("/digitizer/history?status=failed")} />
      </KpiGrid>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={{ padding: "15px 18px", borderBottom: "1px solid #EEF0F3", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "14px", fontWeight: 800 }}>In progress</div>
          <div style={{ fontSize: "11px", color: "#94A3B8" }}>Named stages, not an invented percentage</div>
        </div>
        {inProgress.length === 0 ? (
          <Empty title="Nothing is being read" icon="check">Every uploaded document has finished. New uploads appear here while they are read.</Empty>
        ) : (
          inProgress.map((pr) => {
            const elapsed = now - new Date(pr.uploadedAt).getTime();
            const stageName = pipeline[pr.stageIndex]?.label ?? "Queued";
            return (
              <div
                key={pr.id}
                onClick={() =>
                  openPanel({
                    kicker: "Processing",
                    title: pr.name,
                    badge: stageName,
                    badgeTone: "blue",
                    rows: [
                      ["Current stage", stageName],
                      ["Started", whenLabel(pr.uploadedAt)],
                      ["Elapsed", durationLabel(elapsed)],
                      ["Pages", `${pr.pageCount}`],
                      ["Stages completed", `${pr.stageIndex} of ${pipeline.length}`],
                      ["Uploaded by", pr.uploadedBy?.name ?? "—"],
                      ["Progress percentage", "Not shown — it would be invented", "muted"],
                      ["Records written", "0", "pos"],
                    ],
                    bulletsTitle: "Why no percentage",
                    bullets: ["A percentage would be a guess dressed up as information", "The named stage tells you what is actually happening and what remains", "If a stage fails, the document fails with the stage and the reason kept", "A model outage fails the document; you can reprocess it from History"],
                    note: "Real stages are more useful than a bar that reaches 90% and stops.",
                    primary: "Open document",
                    onPrimary: () => {
                      closePanel();
                      openDoc(pr.id);
                    },
                    secondary: "Close",
                  })
                }
                style={{ padding: "14px 18px", borderTop: "1px solid #F3F4F7", cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ width: "36px", height: "36px", flex: "0 0 36px", borderRadius: "10px", background: "#EFF6FF", color: "#1D4ED8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <DigitizerIcon name="refresh-cw" size={16} style={{ animation: "nxSpin 2s linear infinite" }} />
                  </div>
                  <div style={{ flex: "1 1 260px", minWidth: "220px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 800 }}>{pr.name}</div>
                    <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "4px" }}>{pr.scannerType.replace(/_/g, " ")} · {pr.pageCount} page{pr.pageCount === 1 ? "" : "s"} · {pr.originalName ?? "uploaded file"}</div>
                    <div style={{ display: "flex", gap: "5px", marginTop: "10px", flexWrap: "wrap" }}>
                      {pipeline.map((st, i) => (
                        <div key={st.key} style={{ height: "22px", display: "inline-flex", alignItems: "center", padding: "0 8px", borderRadius: "999px", fontSize: "9.5px", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, background: i < pr.stageIndex ? "#ECFDF3" : i === pr.stageIndex ? "#EFF6FF" : "#F1F3F6", border: `1px solid ${i < pr.stageIndex ? "#BBF0CB" : i === pr.stageIndex ? "#C7DBFE" : "#E1E5EB"}`, color: i < pr.stageIndex ? "#15803D" : i === pr.stageIndex ? "#1D4ED8" : "#94A3B8" }}>
                          {st.label}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ flex: "0 1 200px", minWidth: "150px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#94A3B8" }}>Current stage</div>
                    <div style={{ fontSize: "12.5px", fontWeight: 800, marginTop: "3px" }}>{stageName}</div>
                    <div style={{ fontSize: "10.5px", color: "#94A3B8", marginTop: "3px" }}>
                      Started {new Date(pr.uploadedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {durationLabel(elapsed)} elapsed
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <CardFooterNote>Noxtill shows which stage a document has reached, because a fabricated progress bar tells you nothing about whether it will succeed.</CardFooterNote>
      </Card>

      <Card padding={0} style={{ overflow: "hidden" }}>
        {documents.length === 0 ? (
          <Empty title="No documents yet" icon="files" action={<Btn primary icon="camera" onClick={() => router.push("/digitizer/capture")}>Capture or upload</Btn>} />
        ) : (
          <TableCard minWidth="1080px">
            <thead>
              <tr style={theadStyle}>
                <Th first>Document</Th>
                <Th>Type</Th>
                <Th>Pages</Th>
                <Th>Stage</Th>
                <Th>Confidence</Th>
                <Th>Destination</Th>
                <Th>Status</Th>
                <Th>Uploaded</Th>
                <Th align="right" last>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => {
                const m = STATUS_META[d.status];
                const a = actionOf(d);
                return (
                  <tr key={d.id} onClick={() => openDoc(d.id)} style={{ borderBottom: "1px solid #F3F4F7", cursor: "pointer", background: m.tone === "red" ? "#FEFBFB" : m.tone === "amber" ? "#FFFDF5" : "#fff" }}>
                    <td style={{ padding: "11px 12px 11px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                        <DocThumb icon={KIND_ICON[d.kind]} tone={m.tone} />
                        <div style={{ fontSize: "12.5px", fontWeight: 700 }}>{d.name}</div>
                      </div>
                    </td>
                    <td style={{ padding: "11px 12px", fontSize: "12px", color: "#45505F" }}>{d.kindLabel}</td>
                    <td style={{ padding: "11px 12px", fontSize: "11.5px", color: "#94A3B8" }}>{pagesLabel(d.pageCount, d.counts.rows)}</td>
                    <td style={{ padding: "11px 12px", fontSize: "11.5px", color: "#45505F" }}>{stageText(d)}</td>
                    <td style={{ padding: "11px 12px" }}>
                      {d.counts.rows > 0 ? <Chip tone={toneOfSummary(d.confidenceSummary)} style={{ height: "21px", fontSize: "10px" }}>{d.confidenceSummary}</Chip> : <span style={{ fontSize: "11px", color: "#94A3B8" }}>—</span>}
                    </td>
                    <td style={{ padding: "11px 12px" }}>
                      {d.destinations.length ? d.destinations.map((x) => <Chip key={x.key} tone="blue" style={{ height: "21px", fontSize: "10px", marginRight: "4px" }}>{x.label}</Chip>) : <Chip tone="neutral" style={{ height: "21px", fontSize: "10px" }}>Not determined</Chip>}
                    </td>
                    <td style={{ padding: "11px 12px" }}><StatusChip status={d.status} style={{ height: "21px", fontSize: "10px" }} /></td>
                    <td style={{ padding: "11px 12px", fontSize: "11.5px", color: "#94A3B8" }}>{whenLabel(d.uploadedAt)}</td>
                    <td style={{ padding: "11px 18px 11px 12px", textAlign: "right" }}>
                      <Btn primary={a.primary} onClick={(e) => { e.stopPropagation(); a.run(); }}>{a.label}</Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        )}
      </Card>
    </div>
  );
}
