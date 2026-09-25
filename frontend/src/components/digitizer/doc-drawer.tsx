"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteDigitizerDocument,
  fetchDigitizerDocument,
  fetchDigitizerOriginal,
  reprocessDigitizerDocument,
  updateDigitizerDocumentRow,
  type AssessedRow,
  type DigitizerScannerType,
  type DocumentDetail,
} from "@/lib/digitizer-api";
import { DigitizerIcon } from "./digitizer-icon";
import { useDigitizerStore } from "./digitizer-store";
import { useDigitizerData } from "./digitizer-data";
import { DocTableEditor } from "./doc-table-editor";
import {
  Btn,
  Chip,
  Empty,
  KIND_ICON,
  LEVEL_META,
  LoadingBlock,
  ROW_STATE_META,
  STATUS_META,
  StatusChip,
  formatMoney,
  monoStyle,
  pagesLabel,
  plural,
  toneOfSummary,
  whenLabel,
} from "./digitizer-ui";
import type { Tone } from "./digitizer-types";

export const DD_SECTIONS = ["Document", "Quality", "Classification", "Extracted fields", "Table", "Validation", "Duplicates", "Normalization", "Mapping", "Import", "AI", "Audit"];

type KV = { label: string; value: ReactNode; tone?: "pos" | "neg" | "muted" };

function KVList({ title, lineage, rows }: { title: string; lineage?: string; rows: KV[] }) {
  return (
    <div style={{ border: "1px solid #E6E8EC", borderRadius: "12px", overflow: "hidden" }}>
      <div style={{ padding: "11px 13px", background: "#FAFBFC", borderBottom: "1px solid #EEF0F3", display: "flex", alignItems: "center", gap: "9px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#7A8798" }}>{title}</div>
        {lineage && <div style={{ marginLeft: "auto", fontSize: "10.5px", color: "#94A3B8" }}>{lineage}</div>}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "11px 13px", borderTop: i === 0 ? "none" : "1px solid #EEF0F3", background: i % 2 ? "#FCFCFD" : "#fff" }}>
          <div style={{ fontSize: "12px", color: "#5B6675", fontWeight: 600, flex: "0 0 42%" }}>{r.label}</div>
          <div style={{ fontSize: "12.5px", fontWeight: 700, textAlign: "right", flex: 1, color: r.tone === "neg" ? "#B42318" : r.tone === "pos" ? "#15803D" : r.tone === "muted" ? "#94A3B8" : "#0F172A" }}>{r.value}</div>
        </div>
      ))}
    </div>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#94A3B8", marginBottom: "10px" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        {items.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: "9px", alignItems: "flex-start" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#16A34A", marginTop: "6px", flexShrink: 0 }} />
            <div style={{ fontSize: "12.5px", color: "#45505F", lineHeight: 1.55 }}>{b}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NoteBox({ children }: { children: ReactNode }) {
  return (
    <div style={{ border: "1px solid #E6E8EC", background: "#FCFCFD", borderRadius: "12px", padding: "13px", display: "flex", gap: "9px" }}>
      <DigitizerIcon name="info" size={15} style={{ color: "#7A8798", marginTop: "1px" }} />
      <div style={{ fontSize: "11.5px", color: "#5B6675", lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

const stateTone = (s: "passed" | "warning" | "failed" | "unknown"): "pos" | "neg" | "muted" | undefined =>
  s === "passed" ? "pos" : s === "failed" ? "neg" : s === "unknown" ? "muted" : undefined;

function handwritingLabel(h: DocumentDetail["handwriting"]) {
  return h === "printed" ? "Printed" : h === "handwritten" ? "Handwritten" : h === "mixed" ? "Printed and handwritten" : "Not reported";
}

export function DocDrawer() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refresh } = useDigitizerData();
  const { docId, ddSection, setDocSection, closeDoc, notify, notifyError, openConfirm, openPanel, closeOverlays, openOriginal } = useDigitizerStore();

  const { data: doc, error } = useQuery({
    queryKey: ["digitizer", "doc", docId],
    queryFn: () => fetchDigitizerDocument(docId!),
    enabled: !!docId,
    refetchInterval: (q) => (q.state.data && (q.state.data.status === "queued" || q.state.data.status === "processing") ? 2000 : false),
  });

  const setDoc = (d: DocumentDetail) => {
    queryClient.setQueryData(["digitizer", "doc", d.id], d);
    refresh();
  };

  const reprocess = useMutation({
    mutationFn: ({ id, scannerType }: { id: string; scannerType?: DigitizerScannerType }) => reprocessDigitizerDocument(id, scannerType),
    onSuccess: (d) => {
      setDoc(d);
      notify("Reprocessing started", `Version ${d.version} is being read. The earlier extraction is kept as version ${d.version - 1}.`);
    },
    onError: (e: unknown) => notifyError("Could not reprocess", e instanceof Error ? e.message : "Please try again."),
  });

  const decide = useMutation({
    mutationFn: ({ rowId, decision }: { rowId: string; decision: "use_existing" | "create_new" | null }) => updateDigitizerDocumentRow(docId!, rowId, { duplicateDecision: decision }),
    onSuccess: (d) => {
      setDoc(d);
      notify("Decision recorded", "Recorded against the row with who chose it and when.");
    },
    onError: (e: unknown) => notifyError("Could not record the decision", e instanceof Error ? e.message : "Please try again."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDigitizerDocument(id),
    onSuccess: (out) => {
      closeOverlays();
      queryClient.removeQueries({ queryKey: ["digitizer", "doc", out.id] });
      refresh();
      notify("Document deleted", out.importedRecordsKept ? `${plural(out.importedRecordsKept, "imported record")} stay in their modules but no longer link to this scan.` : "The original and everything extracted from it were removed.");
    },
    onError: (e: unknown) => notifyError("Could not delete", e instanceof Error ? e.message : "Please try again."),
  });

  if (!docId) return null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const go = (href: string) => {
    closeOverlays();
    router.push(href);
  };

  const askReprocess = (d: DocumentDetail, scannerType?: DigitizerScannerType, label?: string) =>
    openConfirm({
      title: label ? `Read this as ${label}?` : "Reprocess this document?",
      tone: "amber",
      icon: "refresh-cw",
      body: "The reader looks at the original file again and produces a new version of the extraction. Your corrections stay in the earlier version — nothing is overwritten silently.",
      rows: [
        ["Document", d.name],
        ["Current version", `Version ${d.version}`],
        ["After reprocessing", `Version ${d.version + 1}`],
        ["Your corrections", "Kept in the earlier version", "pos"],
        ["Original file", "Unchanged", "pos"],
      ],
      primary: label ? `Read as ${label}` : "Reprocess",
      cancel: "Cancel",
      onConfirm: () => reprocess.mutateAsync({ id: d.id, scannerType }),
    });

  const askDelete = (d: DocumentDetail) =>
    openConfirm({
      title: "Delete this document?",
      tone: "red",
      icon: "trash-2",
      body: "The original file and everything extracted from it are permanently removed. Records already imported from it stay in their modules, but they lose their link back to this source.",
      rows: [
        ["Document", d.name],
        ["Original file", "Deleted permanently", "neg"],
        ["Extracted data", "Deleted permanently", "neg"],
        ["Records already imported", d.importedRecords ? `${plural(d.importedRecords, "record")} · stay, lose their source link` : "None"],
      ],
      primary: "Delete document",
      cancel: "Keep document",
      onConfirm: () => remove.mutateAsync(d.id),
    });

  const download = async (d: DocumentDetail) => {
    try {
      const o = await fetchDigitizerOriginal(d.id);
      window.open(o.url, "_blank", "noopener");
    } catch (e) {
      notifyError("Could not open the original", e instanceof Error ? e.message : "Please try again.");
    }
  };

  const actions = (d: DocumentDetail): [string, string, boolean, () => void][] => [
    ["Review fields", "list-checks", false, () => go(`/digitizer/review?batch=${d.id}`)],
    ["View original", "zoom-in", false, () => openOriginal(d.id, d.name)],
    ["Reprocess", "refresh-cw", false, () => askReprocess(d)],
    ["Correct a field", "pencil", false, () => go(`/digitizer/review?batch=${d.id}`)],
    ["Check duplicates", "copy-check", false, () => setDocSection("Duplicates")],
    ["Prepare import", "file-input", false, () => go(`/digitizer/import?doc=${d.id}`)],
    ["Download original", "file-output", false, () => void download(d)],
    ["Delete document", "trash-2", true, () => askDelete(d)],
  ];

  const busy = doc && (doc.status === "queued" || doc.status === "processing");
  const statusTone = doc ? STATUS_META[doc.status].tone : "neutral";

  return (
    <div onClick={closeDoc} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(12,23,39,.38)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={stop} style={{ width: "840px", maxWidth: "100%", height: "100%", background: "#fff", boxShadow: "-18px 0 44px rgba(12,23,39,.16)", display: "flex", flexDirection: "column", animation: "nxDrawerIn .22s cubic-bezier(.2,.8,.3,1)" }}>
        {!doc ? (
          <div style={{ padding: "24px" }}>{error ? <Empty title="Could not open this document" icon="circle-alert">{error instanceof Error ? error.message : "Please try again."}</Empty> : <LoadingBlock label="Opening the document…" />}</div>
        ) : (
          <>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #EEF0F3", display: "flex", alignItems: "flex-start", gap: "13px" }}>
              <div style={{ width: "44px", height: "44px", flex: "0 0 44px", borderRadius: "12px", background: statusTone === "red" ? "#FEE4E2" : statusTone === "amber" ? "#FEF3C7" : statusTone === "blue" ? "#EFF6FF" : "#ECFDF3", color: statusTone === "red" ? "#B42318" : statusTone === "amber" ? "#B45309" : statusTone === "blue" ? "#1D4ED8" : "#15803D", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <DigitizerIcon name={KIND_ICON[doc.kind]} size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "-.015em" }}>{doc.name}</div>
                <div style={{ fontSize: "11.5px", color: "#7A8798", marginTop: "3px" }}>
                  {pagesLabel(doc.pageCount, doc.counts.rows)} · {handwritingLabel(doc.handwriting)}
                  {doc.language ? ` · ${doc.language}` : ""} · uploaded {whenLabel(doc.uploadedAt)}
                  {doc.uploadedBy ? ` by ${doc.uploadedBy.name}` : ""}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "7px", marginTop: "9px", flexWrap: "wrap" }}>
                  <StatusChip status={doc.status} style={{ height: "23px" }} />
                  <Chip tone={doc.kindConfidence === "low" ? "red" : doc.kindConfidence === "medium" ? "amber" : "neutral"}>
                    {doc.kindLabel}
                    {doc.kindConfidence ? ` · ${doc.kindConfidence}` : ""}
                  </Chip>
                  {doc.destinations.map((d) => (
                    <Chip key={d.key} tone="blue">
                      <DigitizerIcon name="file-input" size={12} />
                      <span>{d.label}</span>
                    </Chip>
                  ))}
                  {doc.counts.rows > 0 && <Chip tone={toneOfSummary(doc.confidenceSummary)}>{doc.confidenceSummary}</Chip>}
                  {doc.version > 1 && <Chip tone="blue">v{doc.version}</Chip>}
                </div>
              </div>
              <div onClick={closeDoc} style={{ width: "30px", height: "30px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", color: "#7A8798", cursor: "pointer", flexShrink: 0 }}>
                <DigitizerIcon name="x" size={16} strokeWidth={2.25} />
              </div>
            </div>

            <div style={{ padding: "14px 20px", background: "#FBFAFF", borderBottom: "1px solid #EEF0F3" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                <div style={{ width: "26px", height: "26px", flex: "0 0 26px", borderRadius: "8px", background: "#F5F3FF", color: "#6D28D9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DigitizerIcon name="sparkles" size={14} />
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#6D28D9" }}>What should I do?</div>
                <div style={{ marginLeft: "auto", fontSize: "10.5px", color: "#94A3B8" }}>Nothing is written until you confirm an import</div>
              </div>
              <div style={{ fontSize: "13.5px", fontWeight: 800, marginTop: "10px" }}>{doc.nextAction.title}</div>
              <div style={{ fontSize: "12px", color: "#45505F", lineHeight: 1.55, marginTop: "5px" }}>{doc.nextAction.why}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "7px", marginTop: "11px", flexWrap: "wrap" }}>
                <Btn
                  primary
                  onClick={() => go(doc.status === "imported" ? "/digitizer/history" : doc.status === "failed" ? "/digitizer/capture" : doc.status === "ready" ? `/digitizer/import?doc=${doc.id}` : `/digitizer/review?batch=${doc.id}`)}
                >
                  {doc.status === "imported" ? "View the import" : doc.status === "failed" ? "Retake photo" : doc.status === "ready" ? "Open import" : "Open review"}
                </Btn>
                <Btn icon="zoom-in" onClick={() => openOriginal(doc.id, doc.name)}>View original</Btn>
                <div style={{ marginLeft: "auto", fontSize: "10.5px", color: "#94A3B8" }}>{doc.evidence}</div>
              </div>
            </div>

            <div className="nx-scroll" style={{ display: "flex", gap: "3px", padding: "0 20px", borderBottom: "1px solid #EEF0F3", overflowX: "auto" }}>
              {DD_SECTIONS.map((name) => {
                const on = ddSection === name;
                return (
                  <div key={name} onClick={() => setDocSection(name)} style={{ padding: "11px 9px", fontSize: "12.5px", cursor: "pointer", whiteSpace: "nowrap", fontWeight: on ? 700 : 600, color: on ? "#0F172A" : "#5B6675", boxShadow: on ? "inset 0 -2px 0 #16A34A" : "none" }}>
                    {name}
                  </div>
                );
              })}
            </div>

            <div className="nx-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              {busy ? (
                <Empty title="This document is still being read" icon="refresh-cw">Details appear here as soon as extraction finishes. It is at the {doc.stage ?? "queued"} stage right now.</Empty>
              ) : (
                <SectionBody
                  section={ddSection}
                  doc={doc}
                  onReprocessAs={(scanner, label) => askReprocess(doc, scanner, label)}
                  onDecide={(rowId, decision) => decide.mutate({ rowId, decision })}
                  onOpenRow={(rowId) => go(`/digitizer/review?batch=${doc.id}&row=${rowId}`)}
                  onSaved={setDoc}
                  openPanel={openPanel}
                  go={go}
                />
              )}
            </div>

            <div className="nx-scroll" style={{ padding: "12px 20px", borderTop: "1px solid #EEF0F3", background: "#FCFCFD", display: "flex", gap: "7px", overflowX: "auto" }}>
              {actions(doc).map(([label, icon, risky, run]) => (
                <div key={label} onClick={run} style={{ height: "34px", display: "flex", alignItems: "center", gap: "6px", padding: "0 11px", borderRadius: "9px", cursor: "pointer", fontSize: "12.5px", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${risky ? "#FBD5D2" : "#D5DAE2"}`, background: "#fff", color: risky ? "#B42318" : "#45505F" }}>
                  <DigitizerIcon name={icon} size={14} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SectionBody({
  section,
  doc,
  onReprocessAs,
  onDecide,
  onOpenRow,
  onSaved,
  openPanel,
  go,
}: {
  section: string;
  doc: DocumentDetail;
  onReprocessAs: (scanner: DigitizerScannerType, label: string) => void;
  onDecide: (rowId: string, decision: "use_existing" | "create_new" | null) => void;
  onOpenRow: (rowId: string) => void;
  onSaved: (d: DocumentDetail) => void;
  openPanel: ReturnType<typeof useDigitizerStore.getState>["openPanel"];
  go: (href: string) => void;
}) {
  const failed = doc.status === "failed";
  const money = (n: number) => formatMoney(n, doc.currency);

  switch (section) {
    case "Quality":
      return (
        <>
          <KVList
            title="Quality"
            lineage="File measurements and the reader’s own assessment"
            rows={[
              { label: "Overall", value: doc.quality.overall === "good" ? "Acceptable" : doc.quality.overall === "warnings" ? "Acceptable with warnings" : doc.quality.overall === "failed" ? "Failed the quality check" : "Not assessed", tone: doc.quality.overall === "good" ? "pos" : doc.quality.overall === "failed" ? "neg" : doc.quality.overall === "unknown" ? "muted" : undefined },
              ...doc.quality.rows.map((r) => ({ label: `${r.label} · ${r.source === "file" ? "measured" : "reported"}`, value: r.detail, tone: stateTone(r.state) })),
              ...(doc.quality.notes ? [{ label: "Reader’s note", value: doc.quality.notes }] : []),
              { label: "Enhancement applied", value: "None — the original is what was read", tone: "muted" as const },
            ]}
          />
          <Bullets title="What was checked" items={["Resolution is measured from the file; blur, glare, shadow, tilt and cut-off text are the reader’s own assessment of the page", "Nothing is deskewed, cropped or cleaned up — the image that was uploaded is the image that was read", failed ? "Extraction stopped here rather than return values the reader could not stand behind" : "A page that fails is flagged by name rather than given an invented quality score"]} />
        </>
      );

    case "Classification":
      return (
        <>
          <KVList
            title="Classification"
            lineage="Reported by the reader"
            rows={[
              { label: "Detected type", value: doc.classification.kindLabel },
              { label: "How sure", value: doc.classification.confidence === null ? "Not reported" : `${Math.round(doc.classification.confidence * 100)}%` },
              { label: "Scanner you chose", value: doc.classification.requestedScanner.replace(/_/g, " ") },
              { label: "Language", value: doc.language ?? "Not reported" },
              { label: "Handwriting", value: handwritingLabel(doc.handwriting) },
              { label: "Goes to", value: doc.destinations.length ? doc.destinations.map((d) => d.label).join(" · ") : "Nothing determined", tone: doc.destinations.length ? undefined : "muted" },
              { label: "Changeable", value: "Yes — re-run as another type" },
            ]}
          />
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "#94A3B8", marginBottom: "10px" }}>Read this document as…</div>
            <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
              {doc.classification.alternatives.map((a) => {
                const current = a.scannerType === doc.classification.requestedScanner;
                return (
                  <div key={a.kind} onClick={current ? undefined : () => onReprocessAs(a.scannerType, a.label)} style={{ height: "32px", display: "flex", alignItems: "center", gap: "6px", padding: "0 11px", borderRadius: "9px", fontSize: "12px", fontWeight: 700, cursor: current ? "default" : "pointer", border: `1px solid ${current ? "#16A34A" : "#D5DAE2"}`, background: current ? "#ECFDF3" : "#fff", color: current ? "#15803D" : "#45505F" }}>
                    <DigitizerIcon name={KIND_ICON[a.kind]} size={13} />
                    {a.label}
                  </div>
                );
              })}
              {doc.classification.unsupportedKinds.map((k) => (
                <div key={k} title="There is no importer for this type yet" style={{ height: "32px", display: "flex", alignItems: "center", gap: "6px", padding: "0 11px", borderRadius: "9px", fontSize: "12px", fontWeight: 700, border: "1px dashed #D5DAE2", color: "#94A3B8" }}>
                  {k === "booking_register" ? "Booking register" : "Staff register"} · not supported yet
                </div>
              ))}
            </div>
          </div>
          <NoteBox>An unknown type is shown as unknown, not forced into the nearest category. Re-running keeps this version and adds a new one.</NoteBox>
        </>
      );

    case "Extracted fields":
      return doc.rows.length === 0 ? (
        <Empty title={failed ? "Nothing was extracted" : "No rows"} icon="list-checks">{failed ? doc.failureReason : "This document has no extracted rows."}</Empty>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {doc.rows.slice(0, 200).map((r) => (
              <RowSummary key={r.id} row={r} onClick={() => onOpenRow(r.id)} />
            ))}
            {doc.rows.length > 200 && <div style={{ fontSize: "11.5px", color: "#94A3B8" }}>Showing the first 200 of {doc.rows.length} rows — open Review to see the rest.</div>}
          </div>
          <NoteBox>Click a row to open it in Review beside the original. A blank value is blank because it could not be read — it is never a guess.</NoteBox>
        </>
      );

    case "Table":
      // Re-mounted whenever the server's figures change, so the drafts always start from what is stored.
      return <DocTableEditor key={JSON.stringify([doc.version, doc.table.lineItems, doc.table.totals, doc.table.ledger])} doc={doc} onSaved={onSaved} />;

    case "Validation":
      return (
        <>
          {doc.reconciliation && (
            <KVList
              title={doc.reconciliation.kind === "ledger" ? "Ledger reconciliation" : "Invoice reconciliation"}
              lineage="Computed from the extracted figures"
              rows={[
                { label: "Result", value: doc.reconciliation.ok ? "Reconciles" : "Does not reconcile", tone: doc.reconciliation.ok ? "pos" : "neg" },
                ...doc.reconciliation.components.map((c) => ({ label: c.label, value: money(c.value) })),
                { label: "Calculated", value: money(doc.reconciliation.calculated) },
                { label: doc.reconciliation.kind === "ledger" ? "Written closing balance" : "Printed total", value: doc.reconciliation.stated === null ? "Not read" : money(doc.reconciliation.stated) },
                { label: "Difference", value: doc.reconciliation.difference === null ? "—" : money(Math.abs(doc.reconciliation.difference)), tone: doc.reconciliation.ok ? "pos" : "neg" },
                { label: "Adjusted by Noxtill", value: "Never", tone: "pos" },
              ]}
            />
          )}
          {doc.issues.length === 0 ? (
            <Empty title={failed ? "Nothing to validate" : "No validation issues"} icon="circle-check">{failed ? "Nothing was extracted, so nothing could be validated." : "Every row passed the checks for required values, formats, amounts and dates."}</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {doc.issues.map((i) => (
                <div
                  key={i.code}
                  onClick={() =>
                    openPanel({
                      kicker: "Validation issue",
                      title: i.title,
                      badge: `${i.severity === "critical" ? "Critical" : "Warning"} · ${i.detail}`,
                      badgeTone: i.severity === "critical" ? "red" : "amber",
                      rows: [
                        ["Severity", i.severity === "critical" ? "Critical" : "Warning", i.severity === "critical" ? "neg" : undefined],
                        ["Affected", plural(i.affected, "row")],
                        ["Blocks import", i.blocks === "document" ? "The whole document" : i.blocks === "rows" ? "Only the affected rows" : "Nothing", i.blocks === "none" ? "pos" : "neg"],
                        ...(i.cause ? [["Likely cause", i.cause] as [string, string]] : []),
                        ["Figure adjusted", "None", "pos"],
                      ],
                      primary: "Open in Review",
                      onPrimary: () => go(`/digitizer/review?batch=${doc.id}${i.rowIds[0] ? `&row=${i.rowIds[0]}` : ""}`),
                      secondary: "Close",
                    })
                  }
                  style={{ display: "flex", alignItems: "flex-start", gap: "9px", padding: "10px 11px", borderRadius: "10px", border: "1px solid #EEF0F3", cursor: "pointer" }}
                >
                  <Chip tone={i.severity === "critical" ? "red" : "amber"} style={{ height: "19px", fontSize: "9px", flexShrink: 0 }}>{i.severity === "critical" ? "Critical" : "Warning"}</Chip>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 700 }}>{i.title}</div>
                    <div style={{ fontSize: "10.5px", color: "#94A3B8", marginTop: "3px" }}>{i.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <NoteBox>A critical error blocks the affected rows, not the whole document — except a credit ledger that does not reconcile, which blocks every credit row.</NoteBox>
        </>
      );

    case "Duplicates": {
      const dups = doc.rows.filter((r) => r.duplicate && r.state !== "imported");
      return dups.length === 0 ? (
        <Empty title={failed ? "Not checked" : "No matches with existing records"} icon="copy-check">
          {failed ? "Nothing was extracted, so nothing was compared." : "Phone, email and SKU were compared with your existing customers, suppliers and products; a name on its own only flags."}
        </Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
          {dups.map((r) => (
            <div key={r.id} style={{ border: "1px solid #EEF0F3", borderRadius: "11px", padding: "11px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <div style={{ fontSize: "12.5px", fontWeight: 700 }}>{r.displayName}</div>
                <Chip tone={r.duplicate!.level === "high" ? "amber" : "neutral"} style={{ height: "19px", fontSize: "9px" }}>{r.duplicate!.level === "high" ? "Strong match" : "Weak match"}</Chip>
                <span style={{ ...monoStyle, fontSize: "10px", color: "#94A3B8" }}>{r.sourceLabel}</span>
              </div>
              <div style={{ fontSize: "11px", color: "#5B6675", marginTop: "5px", lineHeight: 1.45 }}>{r.duplicate!.basis} Existing: {r.duplicate!.existing.name}.</div>
              <div style={{ display: "flex", gap: "6px", marginTop: "9px", flexWrap: "wrap" }}>
                {(["use_existing", "create_new"] as const).map((d) => {
                  const on = r.duplicateDecision === d;
                  const blocked = d === "create_new" && r.duplicate!.entity === "Customers" && r.duplicate!.phoneMatch;
                  return (
                    <div key={d} title={blocked ? "Phone numbers are unique — use the existing customer or correct the phone number" : undefined} onClick={blocked ? undefined : () => onDecide(r.id, on ? null : d)} style={{ height: "26px", display: "inline-flex", alignItems: "center", padding: "0 9px", borderRadius: "7px", fontSize: "11px", fontWeight: 700, cursor: blocked ? "not-allowed" : "pointer", opacity: blocked ? 0.45 : 1, border: `1px solid ${on ? "#16A34A" : "#D5DAE2"}`, background: on ? "#ECFDF3" : "#fff", color: on ? "#15803D" : "#45505F" }}>
                      {d === "use_existing" ? "Use existing" : "Create new"}
                    </div>
                  );
                })}
                <div onClick={() => onOpenRow(r.id)} style={{ height: "26px", display: "inline-flex", alignItems: "center", padding: "0 9px", borderRadius: "7px", fontSize: "11px", fontWeight: 700, cursor: "pointer", border: "1px solid #D5DAE2", background: "#fff", color: "#45505F" }}>
                  Compare in Review
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    case "Normalization":
      return doc.normalization.length === 0 ? (
        <Empty title={failed ? "Not applicable" : "Nothing needed normalizing"} icon="table-2">{failed ? "Nothing was extracted." : "Every value was already in its final form."}</Empty>
      ) : (
        <>
          <KVList title="Normalization" lineage="Original and normalized both kept" rows={doc.normalization.map((n) => ({ label: n.label, value: `${plural(n.count, "value")}${n.examples[0] ? ` · ${n.examples[0].from} → ${n.examples[0].to}` : ""}` }))} />
          {doc.rows.some((r) => r.fields.some((f) => f.kind === "phone" && f.issue)) && (
            <NoteBox>
              {plural(doc.rows.filter((r) => r.fields.some((f) => f.kind === "phone" && f.issue)).length, "phone number")} could not be recognised and were left exactly as read, flagged in Review — no digits were added or removed.
            </NoteBox>
          )}
          <NoteBox>Every value shows the original beside the normalized form. A silent correction is indistinguishable from a silent error.</NoteBox>
        </>
      );

    case "Mapping":
      return doc.mapping.length === 0 ? (
        <Empty title={failed ? "Not possible" : "Nothing to map"} icon="table-2">{failed ? "Nothing was extracted." : "No values were extracted to map."}</Empty>
      ) : (
        <>
          <div style={{ border: "1px solid #E6E8EC", borderRadius: "12px", overflow: "hidden" }}>
            {doc.mapping.map((m, i) => (
              <div key={`${m.destination}-${m.source}`} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 13px", borderTop: i ? "1px solid #EEF0F3" : "none", background: m.status === "ignored" ? "#FCFCFD" : "#fff" }}>
                <div style={{ ...monoStyle, fontSize: "12px", fontWeight: 700, flex: "0 0 30%" }}>{m.source}</div>
                <div style={{ fontSize: "12px", color: "#45505F", flex: 1 }}>{m.target ?? "Not mapped"}</div>
                <span style={{ fontSize: "10.5px", color: "#94A3B8" }}>{plural(m.rows, "row")}</span>
                <Chip tone={m.status === "mapped" ? "green" : "neutral"} style={{ height: "21px", fontSize: "10px" }}>{m.status === "mapped" ? "Mapped" : "Ignored"}</Chip>
              </div>
            ))}
          </div>
          <NoteBox>Mapping is fixed by the document type — a value the reader returned that has no home in Noxtill is ignored, not force-fitted into the nearest field.</NoteBox>
        </>
      );

    case "Import": {
      const p = doc.importPreview;
      return (
        <>
          <KVList
            title="Import"
            lineage="Nothing is written until you confirm"
            rows={[
              { label: "Status", value: STATUS_META[doc.status].label },
              { label: "Would create", value: String(p.counts.create) },
              { label: "Would update", value: String(p.counts.update) },
              { label: "Would skip", value: String(p.counts.skip) },
              { label: "Blocked", value: p.counts.blocked ? `${p.counts.blocked} · ${[p.blocked.lowConfidence && `${p.blocked.lowConfidence} low confidence`, p.blocked.duplicates && `${p.blocked.duplicates} duplicate${p.blocked.duplicates === 1 ? "" : "s"}`, p.blocked.invalid && `${p.blocked.invalid} invalid or missing`, p.blocked.reconciliation && `${p.blocked.reconciliation} unreconciled`].filter(Boolean).join(" · ")}` : "0", tone: p.counts.blocked ? "neg" : "pos" },
              { label: "Already written", value: String(p.counts.written) },
              { label: "High-risk destination", value: p.highRisk ? "Yes — credit; a ledger that does not reconcile blocks entirely" : "No" },
            ]}
          />
          {doc.jobs.length > 0 && <KVList title="Import jobs" rows={doc.jobs.map((j) => ({ label: `${j.id} · ${whenLabel(j.at)}`, value: `${j.created} created · ${j.updated} updated · ${j.skipped} skipped · ${j.failed} failed`, tone: j.failed ? ("neg" as const) : undefined }))} />}
          <NoteBox>{p.reason ?? "Importing writes exactly the rows counted above — no more, no fewer. Rollback is not offered: imported records live in their own modules."}</NoteBox>
        </>
      );
    }

    case "AI": {
      const c = doc.counts;
      return (
        <>
          <KVList
            title="Explainable extraction"
            lineage="Read from the document’s own record"
            rows={[
              { label: "Top recommendation", value: doc.nextAction.title },
              { label: "Evidence", value: doc.evidence },
              { label: "Reading model", value: doc.model ?? "Not read yet", tone: doc.model ? undefined : "muted" },
              { label: "Type confidence", value: doc.kindConfidence ?? "Not reported" },
              { label: "Row confidence", value: doc.counts.rows ? doc.confidenceSummary : "—" },
              { label: "Fields left blank", value: plural(c.unreadable, "field") },
              { label: "Rows you corrected", value: plural(doc.rows.filter((r) => r.corrected).length, "row") },
              { label: "Arithmetic adjusted", value: "Never — mismatches are reported as printed", tone: "pos" },
              { label: "Records merged automatically", value: "None", tone: "pos" },
            ]}
          />
          <Bullets title="What the reader is told not to do" items={["Invent a phone, price, quantity, date, name, SKU, balance or total — unreadable values are requested blank", "Adjust a figure so that arithmetic reconciles", "Report more confidence than it has — low confidence keeps a field flagged until you accept it"]} />
          <NoteBox>These are instructions to a model and checks Noxtill runs afterwards; they are why flagged values exist, not a guarantee that every value is right. Check anything important against the original.</NoteBox>
        </>
      );
    }

    case "Audit":
      return (
        <>
          <div style={{ border: "1px solid #E6E8EC", borderRadius: "12px", overflow: "hidden" }}>
            {doc.events.length === 0 ? <Empty title="No events recorded" icon="history" /> : null}
            {[...doc.events].reverse().map((e, i) => (
              <div key={i} style={{ padding: "11px 13px", borderTop: i ? "1px solid #EEF0F3" : "none", background: i % 2 ? "#FCFCFD" : "#fff" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <Chip tone={e.action === "failed" ? "red" : e.action === "imported" ? "green" : "neutral"} style={{ height: "19px", fontSize: "9.5px" }}>{e.action.replace(/_/g, " ")}</Chip>
                  <span style={{ fontSize: "11px", color: "#94A3B8" }}>{whenLabel(e.at)} · {e.actor?.name ?? "System"}</span>
                </div>
                <div style={{ fontSize: "12px", color: "#45505F", marginTop: "5px", lineHeight: 1.5 }}>{e.detail}</div>
              </div>
            ))}
          </div>
          {doc.versions.length > 0 && <KVList title="Earlier versions" lineage="Kept when a document is reprocessed" rows={doc.versions.map((v) => ({ label: `Version ${v.version} · ${whenLabel(v.createdAt)}`, value: `${plural(v.rows, "row")} · ${v.corrected} corrected` }))} />}
          <NoteBox>Your corrections are recorded separately from what the reader extracted, and reprocessing creates a new version instead of overwriting the old one.</NoteBox>
        </>
      );

    case "Document":
    default:
      return (
        <>
          <KVList
            title="Document"
            lineage="Original preserved"
            rows={[
              { label: "Name", value: doc.name },
              { label: "File", value: doc.originalName ?? "—" },
              { label: "Type", value: `${doc.kindLabel}${doc.kindConfidence ? ` · ${doc.kindConfidence} confidence` : ""}` },
              { label: "Pages and records", value: pagesLabel(doc.pageCount, doc.counts.rows) },
              { label: "Handwriting", value: handwritingLabel(doc.handwriting) },
              { label: "Language", value: doc.language ?? "Not reported" },
              { label: "Uploaded", value: `${whenLabel(doc.uploadedAt)}${doc.uploadedBy ? ` · ${doc.uploadedBy.name}` : ""}` },
              { label: "Status", value: STATUS_META[doc.status].label },
              { label: "Confidence", value: doc.counts.rows ? doc.confidenceSummary : "Nothing extracted", tone: doc.counts.rows ? undefined : "muted" },
              { label: "Destination", value: doc.destinations.length ? doc.destinations.map((d) => d.label).join(" · ") : "Not determined", tone: doc.destinations.length ? undefined : "muted" },
              { label: "Version", value: `v${doc.version}` },
              ...(doc.approvedAt ? [{ label: "Approved", value: `${whenLabel(doc.approvedAt)}${doc.approvedBy ? ` · ${doc.approvedBy.name}` : ""}` }] : []),
              { label: "Original file", value: doc.originalRetained ? "Kept — stored exactly as uploaded" : "Not stored", tone: doc.originalRetained ? "pos" : "neg" },
            ]}
          />
          {doc.invoice.number || doc.invoice.supplier ? (
            <KVList title="Read from the page" rows={[...(doc.invoice.supplier ? [{ label: "Supplier", value: doc.invoice.supplier }] : []), ...(doc.invoice.number ? [{ label: "Invoice number", value: doc.invoice.number }] : []), ...(doc.invoice.date ? [{ label: "Date", value: doc.invoice.date }] : [])]} />
          ) : null}
          <Bullets title="Five distinct states" items={["The source image, extracted values, your corrections and imported records are kept separate", "Every extracted row records the page and row it came from", failed ? "Nothing was extracted from this document, so there is no structured data to show" : "Nothing has been written to any module from this document unless the status says imported"]} />
          {doc.stage && doc.stageStartedAt && <NoteBox>Reached the {doc.stage} stage {whenLabel(doc.stageStartedAt)}.</NoteBox>}
        </>
      );
  }
}

function RowSummary({ row, onClick }: { row: AssessedRow; onClick: () => void }) {
  const lvl = LEVEL_META[row.level];
  const st = ROW_STATE_META[row.state];
  const tone: Tone = row.state === "blocked" || row.state === "failed" ? "red" : row.state === "needs_review" ? "amber" : "neutral";
  const shown = row.fields.filter((f) => !f.blank).slice(0, 3);
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 12px", borderRadius: "11px", cursor: "pointer", flexWrap: "wrap", border: `1px solid ${tone === "red" ? "#FBD5D2" : tone === "amber" ? "#FDE49B" : "#E6E8EC"}`, background: tone === "red" ? "#FEF3F2" : tone === "amber" ? "#FFFBEB" : "#fff" }}>
      <div style={{ flex: "1 1 180px", minWidth: "150px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#94A3B8" }}>{row.destinationLabel}</div>
        <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "3px" }}>{row.displayName}</div>
        <div style={{ fontSize: "11px", color: "#7A8798", marginTop: "3px" }}>{shown.map((f) => `${f.label}: ${f.normalized ?? f.value}`).join(" · ") || "No readable values"}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
        <Chip tone={lvl.tone}>{lvl.label}</Chip>
        <Chip tone={st.tone}>{st.label}</Chip>
        <span style={{ ...monoStyle, fontSize: "10px", color: "#94A3B8" }}>{row.sourceLabel}</span>
      </div>
    </div>
  );
}
