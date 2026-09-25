"use client";

import { useRouter } from "next/navigation";
import { DigitizerIcon } from "../digitizer-icon";
import { useDigitizerStore } from "../digitizer-store";
import { useDigitizerData } from "../digitizer-data";
import { BarRow, Btn, Card, CardHeader, Chip, Empty, ErrorBlock, Kpi, KpiGrid, KIND_ICON, LoadingBlock, STATUS_META, plural, toneBorder, toneOfSummary, pagesLabel } from "../digitizer-ui";
import type { Tone } from "../digitizer-types";

export function OverviewScreen() {
  const router = useRouter();
  const { openDoc, openPanel } = useDigitizerStore();
  const { overview, isLoading, error, refresh } = useDigitizerData();

  if (isLoading) return <LoadingBlock label="Loading the Digitizer…" />;
  if (error || !overview) return <ErrorBlock error={error} onRetry={refresh} />;

  const k = overview.kpis;
  const totalDocs = k.documentsProcessed + k.processing + k.queued + k.pendingReview + k.readyToImport;
  if (totalDocs === 0 && overview.recent.length === 0) {
    return (
      <Card padding={0}>
        <Empty
          title="No documents yet"
          icon="scan-text"
          action={
            <Btn primary icon="camera" onClick={() => router.push("/digitizer/capture")}>
              Capture or upload a document
            </Btn>
          }
        >
          Photograph a customer register, a supplier invoice, a stock sheet or a credit ledger. Noxtill reads it, checks it, and shows you what it found — nothing is written to any module until you confirm an import.
        </Empty>
      </Card>
    );
  }

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const fields = k.highConfidence + k.mediumConfidence + k.lowConfidence + k.unreadable;
  const window = `last ${overview.windowDays} days`;

  const nextActions: { label: string; icon: string; target: string }[] = [];
  if (k.rowsNeedHuman > 0) nextActions.push({ label: `Review ${plural(k.rowsNeedHuman, "row")}`, icon: "list-checks", target: "/digitizer/review" });
  for (const d of overview.discrepancies) {
    nextActions.push({ label: d.kind === "ledger" ? "Check ledger balance" : "Resolve invoice total", icon: d.kind === "ledger" ? "credit-card" : "circle-alert", target: `/digitizer/review?batch=${d.documentId}` });
  }
  if (k.cleanRecords > 0) nextActions.push({ label: `Import ${plural(k.cleanRecords, "clean record")}`, icon: "file-input", target: "/digitizer/import" });
  if (k.processing + k.queued > 0) nextActions.push({ label: `${k.processing + k.queued} being read`, icon: "files", target: "/digitizer/queue" });
  if (k.failed > 0) nextActions.push({ label: `Retake ${plural(k.failed, "failed document")}`, icon: "camera", target: "/digitizer/history?status=failed" });

  const kpis: { label: string; value: number; meta: string; tone: Tone; href: string; basis: string }[] = [
    { label: "Documents processed", value: k.documentsProcessed, meta: window, tone: "neutral", href: "/digitizer/history", basis: `Documents uploaded in the ${window} that have finished being read` },
    { label: "Pending review", value: k.pendingReview, meta: `${plural(k.rowsNeedHuman, "row")} need you`, tone: k.pendingReview ? "amber" : "neutral", href: "/digitizer/review", basis: "Open documents with a row that is blocked, low-confidence or waiting for a decision" },
    { label: "Ready to import", value: k.readyToImport, meta: `${plural(k.cleanRecords, "clean record")}`, tone: "green", href: "/digitizer/history?status=ready", basis: "Open documents where every row passed validation" },
    { label: "Imported", value: k.imported, meta: `${plural(k.recordsWritten, "record")} written · ${window}`, tone: "green", href: "/digitizer/history?status=imported", basis: `Documents fully imported in the ${window}` },
    { label: "Failed", value: k.failed, meta: k.failed ? `could not be read · ${window}` : "none", tone: k.failed ? "red" : "neutral", href: "/digitizer/history?status=failed", basis: `Documents that failed in the ${window}, with the reason kept on each` },
    { label: "Duplicates detected", value: k.duplicatesDetected, meta: k.duplicatesDetected ? "none auto-merged" : "no matches with existing data", tone: k.duplicatesDetected ? "amber" : "neutral", href: "/digitizer/review", basis: "Extracted rows in open documents that match a customer, supplier, product or expense you already have" },
    { label: "Pages processed", value: k.pagesProcessed, meta: `across ${plural(k.documentsProcessed, "document")}`, tone: "neutral", href: "/digitizer/history", basis: `Pages in documents read in the ${window}` },
    { label: "Records extracted", value: k.recordsExtracted, meta: `from ${plural(k.pagesProcessed, "page")}`, tone: "neutral", href: "/digitizer/structured", basis: `Rows read from documents in the ${window}` },
    { label: "Fields extracted", value: k.fieldsExtracted, meta: "across all records", tone: "neutral", href: "/digitizer/structured", basis: "Values read (high, medium and low confidence) — blanks are not counted" },
    { label: "High confidence", value: k.highConfidence, meta: `${pct(k.highConfidence, fields)}% of fields`, tone: "green", href: "/digitizer/structured", basis: "Fields the reader was clearly sure about" },
    { label: "Low confidence", value: k.lowConfidence, meta: "read but uncertain", tone: k.lowConfidence ? "amber" : "neutral", href: "/digitizer/review", basis: "Fields read but below your review threshold — they stay flagged until you accept or correct them" },
    { label: "Unreadable", value: k.unreadable, meta: "left blank, not guessed", tone: k.unreadable ? "red" : "neutral", href: "/digitizer/review", basis: "Fields that could not be read — stored blank instead of filled with a guess" },
    { label: "Corrected by you", value: k.correctedByYou, meta: "your fixes, recorded separately", tone: "neutral", href: "/digitizer/history", basis: "Rows where you changed what the reader extracted" },
  ];

  const maxStage = Math.max(1, ...overview.stages.map((s) => s.documents));
  const stageTone: Record<string, Tone> = { ready: "green", review: "amber", processing: "blue", imported: "green", failed: "red", queued: "neutral" };
  const stageHref: Record<string, string> = { ready: "/digitizer/history?status=ready", review: "/digitizer/review", processing: "/digitizer/queue", imported: "/digitizer/history?status=imported", failed: "/digitizer/history?status=failed", queued: "/digitizer/queue" };
  const maxConf = Math.max(1, k.highConfidence, k.mediumConfidence, k.lowConfidence, k.unreadable);
  const confidence: { label: string; meta: string; value: number; tone: Tone }[] = [
    { label: "High", meta: "clear and unambiguous", value: k.highConfidence, tone: "green" },
    { label: "Medium", meta: "readable, some doubt", value: k.mediumConfidence, tone: "blue" },
    { label: "Low", meta: "read but uncertain", value: k.lowConfidence, tone: "amber" },
    { label: "Unreadable", meta: "blank, not guessed", value: k.unreadable, tone: "red" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div style={{ background: "#fff", border: "1px solid #DDD3FE", borderRadius: "13px", boxShadow: "0 1px 2px rgba(16,24,40,.05)", padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ width: "28px", height: "28px", flex: "0 0 28px", borderRadius: "8px", background: "#F5F3FF", color: "#6D28D9", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <DigitizerIcon name="sparkles" size={15} />
          </div>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#6D28D9" }}>What needs you</div>
          <div style={{ marginLeft: "auto", fontSize: "10.5px", color: "#94A3B8" }}>
            {k.recordsWritten === 0 ? "Nothing has been written to any module" : `${plural(k.recordsWritten, "record")} written to modules · ${window}`}
          </div>
        </div>
        <div style={{ fontSize: "14px", fontWeight: 800, marginTop: "11px" }}>
          {overview.openDocuments === 0
            ? "Nothing is waiting — every document has been imported or has failed."
            : `${plural(k.cleanRecords, "clean record")} ${k.cleanRecords === 1 ? "is" : "are"} ready to import and ${plural(k.rowsNeedHuman, "row")} ${k.rowsNeedHuman === 1 ? "needs" : "need"} a human, across ${plural(overview.openDocuments, "open document")}${overview.discrepancies.length ? `. ${plural(overview.discrepancies.length, "document")} ${overview.discrepancies.length === 1 ? "has" : "have"} arithmetic that does not reconcile` : ""}.`}
        </div>
        {overview.discrepancies.length > 0 && (
          <div style={{ fontSize: "12.5px", color: "#45505F", lineHeight: 1.6, marginTop: "7px" }}>
            {overview.discrepancies.map((d) => `${d.documentName}: ${d.message}`).join(" ")} Noxtill did not adjust either figure to make them balance.
          </div>
        )}
        {nextActions.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginTop: "13px", flexWrap: "wrap" }}>
            {nextActions.map((na, i) => (
              <div key={na.label} onClick={() => router.push(na.target)} style={{ height: "32px", display: "flex", alignItems: "center", gap: "6px", padding: "0 12px", borderRadius: "9px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, background: i === 0 ? "#16A34A" : "#fff", color: i === 0 ? "#fff" : "#45505F", border: `1px solid ${i === 0 ? "#16A34A" : "#D5DAE2"}` }}>
                <DigitizerIcon name={na.icon} size={14} />
                <span>{na.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <KpiGrid>
        {kpis.map((m) => (
          <Kpi
            key={m.label}
            label={m.label}
            value={m.value.toLocaleString()}
            meta={m.meta}
            tone={m.tone}
            onClick={() =>
              openPanel({
                kicker: "Digitizer metric",
                title: `${m.label} · ${m.value.toLocaleString()}`,
                badge: m.meta,
                badgeTone: m.tone,
                rows: [
                  ["Value", m.value.toLocaleString()],
                  ["Basis", m.basis],
                  ["Counted from", "Your Digitizer documents — every number here is a count of real rows"],
                  ["Records written to modules", k.recordsWritten ? `${plural(k.recordsWritten, "record")} · ${window}` : "None"],
                  ["Everything else", "Extracted and validated only — nothing written", "pos"],
                ],
                primary: "Show the documents",
                onPrimary: () => {
                  useDigitizerStore.getState().closePanel();
                  router.push(m.href);
                },
                secondary: "Close",
              })
            }
          />
        ))}
      </KpiGrid>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "18px", alignItems: "start" }}>
        <Card>
          <CardHeader title="Where documents stand" note="Real stages, not a percentage" />
          <div style={{ display: "flex", flexDirection: "column", gap: "11px", marginTop: "15px" }}>
            {overview.stages.map((s) => (
              <BarRow key={s.key} label={s.label} meta={s.meta} value={plural(s.documents, "document")} width={(s.documents / maxStage) * 100} tone={stageTone[s.key] ?? "neutral"} onClick={() => router.push(stageHref[s.key] ?? "/digitizer/history")} />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Field confidence" icon="gauge" note={`${plural(k.recordsExtracted, "record")} · ${window}`} />
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "15px" }}>
            {confidence.map((c) => (
              <BarRow key={c.label} chip label={c.label} meta={c.meta} value={c.value.toLocaleString()} width={(c.value / maxConf) * 100} tone={c.tone} onClick={() => router.push("/digitizer/structured")} />
            ))}
          </div>
          <div style={{ border: "1px solid #E6E8EC", background: "#FCFCFD", borderRadius: "11px", padding: "12px", marginTop: "15px", display: "flex", gap: "9px" }}>
            <DigitizerIcon name="info" size={15} style={{ color: "#7A8798", marginTop: "1px" }} />
            <div style={{ fontSize: "11.5px", color: "#5B6675", lineHeight: 1.5 }}>
              Unreadable fields are stored blank, not filled with a plausible guess. A wrong phone number or amount is worse than an empty one you can type in yourself. Confidence is the reader’s own report, so anything below your review threshold (Settings) stays flagged until you accept or correct it.
            </div>
          </div>
        </Card>
      </div>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={{ padding: "15px 18px", borderBottom: "1px solid #EEF0F3", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "14px", fontWeight: 800 }}>Recent documents</div>
          <div onClick={() => router.push("/digitizer/history")} style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 700, color: "#15803D", cursor: "pointer" }}>Full history</div>
        </div>
        <div style={{ padding: "10px 12px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: "12px" }}>
          {overview.recent.map((rd) => {
            const m = STATUS_META[rd.status];
            return (
              <div key={rd.id} onClick={() => openDoc(rd.id)} style={{ border: `1px solid ${toneBorder(m.tone)}`, borderRadius: "12px", overflow: "hidden", cursor: "pointer", background: "#fff", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
                <div style={{ position: "relative", height: "82px", display: "flex", alignItems: "center", justifyContent: "center", background: "repeating-linear-gradient(0deg, #F5F6F8 0 10px, #EEF0F3 10px 11px)", borderBottom: "1px solid #EEF0F3", color: "#7A8798" }}>
                  <DigitizerIcon name={KIND_ICON[rd.kind]} size={22} style={{ opacity: 0.7 }} />
                  <div style={{ position: "absolute", top: "7px", left: "7px" }}>
                    <Chip tone={m.tone} style={{ height: "20px", fontSize: "9.5px" }}>{m.label}</Chip>
                  </div>
                </div>
                <div style={{ padding: "12px 13px 13px" }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 700, lineHeight: 1.35 }}>{rd.name}</div>
                  <div style={{ fontSize: "10.5px", color: "#94A3B8", marginTop: "4px" }}>{rd.kindLabel} · {pagesLabel(rd.pageCount, rd.counts.rows)}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "7px", marginTop: "10px", flexWrap: "wrap" }}>
                    {rd.counts.rows > 0 && <Chip tone={toneOfSummary(rd.confidenceSummary)} style={{ height: "20px", fontSize: "9.5px" }}>{rd.confidenceSummary}</Chip>}
                    {rd.destinations.map((d) => (
                      <Chip key={d.key} tone="blue" style={{ height: "20px", fontSize: "9.5px" }}>{d.label}</Chip>
                    ))}
                    {rd.destinations.length === 0 && <Chip tone="neutral" style={{ height: "20px", fontSize: "9.5px" }}>Not determined</Chip>}
                  </div>
                </div>
              </div>
            );
          })}
          {overview.recent.length === 0 && <div style={{ padding: "18px", fontSize: "12px", color: "#94A3B8" }}>No documents yet.</div>}
        </div>
      </Card>
    </div>
  );
}
