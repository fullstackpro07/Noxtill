"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptAllDigitizerRows,
  DESTINATION_LABELS,
  fetchDigitizerDocument,
  fetchDigitizerReview,
  updateDigitizerDocumentRow,
  type AssessedField,
  type AssessedRow,
  type DigitizerDestination,
  type DocumentDetail,
  type RowPatch,
} from "@/lib/digitizer-api";
import { DigitizerIcon } from "../digitizer-icon";
import { useDigitizerStore } from "../digitizer-store";
import { DIGITIZER_KEY, useDigitizerData } from "../digitizer-data";
import { Btn, Card, Chip, Empty, ErrorBlock, LEVEL_META, LoadingBlock, Notice, ROW_STATE_META, STATUS_META, formatMoney, monoStyle, plural, toneBorder } from "../digitizer-ui";
import { OriginalView, type RegionOverlay } from "../original-viewer";

const colorOf = (r: AssessedRow) => (r.state === "blocked" || r.state === "failed" || r.level === "unreadable" ? "#DC2626" : r.state === "needs_review" || r.level === "low" ? "#F59E0B" : "#16A34A");
const needsAttention = (r: AssessedRow) => r.state === "blocked" || r.state === "needs_review" || r.state === "failed";

export function ReviewScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { refresh } = useDigitizerData();
  const { notify, notifyError, openPanel, closePanel, openDoc } = useDigitizerStore();

  const review = useQuery({ queryKey: [DIGITIZER_KEY, "review"], queryFn: fetchDigitizerReview });
  const batchParam = params.get("batch");
  const rowParam = params.get("row");
  const batchId = batchParam ?? review.data?.documents[0]?.id ?? null;

  const docQuery = useQuery({
    queryKey: [DIGITIZER_KEY, "doc", batchId],
    queryFn: () => fetchDigitizerDocument(batchId!),
    enabled: !!batchId,
    refetchInterval: (q) => (q.state.data && (q.state.data.status === "queued" || q.state.data.status === "processing") ? 2000 : false),
  });
  const doc = docQuery.data;

  const [pickedRowId, setActiveRowId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [editing, setEditing] = useState<{ key: string; field: string; text: string } | null>(null);

  const rows = useMemo(() => doc?.rows ?? [], [doc]);
  // The row being looked at: the one clicked, else the one in the URL, else the first that needs a person.
  const activeRowId = useMemo(() => {
    if (pickedRowId && rows.some((r) => r.id === pickedRowId)) return pickedRowId;
    if (rowParam && rows.some((r) => r.id === rowParam)) return rowParam;
    return (rows.find(needsAttention) ?? rows[0])?.id ?? null;
  }, [pickedRowId, rowParam, rows]);
  const editKey = `${doc?.id}:${activeRowId}`;

  const applyDoc = (d: DocumentDetail) => {
    queryClient.setQueryData([DIGITIZER_KEY, "doc", d.id], d);
    void queryClient.invalidateQueries({ queryKey: [DIGITIZER_KEY, "review"] });
    refresh();
  };

  const patch = useMutation({
    mutationFn: ({ rowId, body }: { rowId: string; body: RowPatch }) => updateDigitizerDocumentRow(batchId!, rowId, body),
    onSuccess: applyDoc,
    onError: (e: unknown) => notifyError("Could not save", e instanceof Error ? e.message : "Please try again."),
  });
  const acceptAll = useMutation({
    mutationFn: () => acceptAllDigitizerRows(batchId!),
    onSuccess: (d) => {
      applyDoc(d);
      notify("Rows accepted", "Every low-confidence row is now marked as reviewed. Rows with errors or duplicates still need you.");
    },
    onError: (e: unknown) => notifyError("Could not accept", e instanceof Error ? e.message : "Please try again."),
  });

  const active = rows.find((r) => r.id === activeRowId) ?? null;
  const attention = rows.filter(needsAttention);

  const select = (docId: string, rowId?: string | null) => {
    router.replace(`/digitizer/review?batch=${docId}${rowId ? `&row=${rowId}` : ""}`);
    setActiveRowId(rowId ?? null);
  };

  const nextIssue = () => {
    if (!attention.length) return notify("Nothing left to review", "Every row in this document is ready, skipped or imported.");
    const i = attention.findIndex((r) => r.id === activeRowId);
    const next = attention[(i + 1) % attention.length];
    setActiveRowId(next.id);
    notify(`${next.displayName}`, `${next.stateReason ?? "Needs a look"} · ${plural(attention.length, "row")} remaining in this document.`);
  };

  const overlays: RegionOverlay[] = useMemo(
    () =>
      rows
        .filter((r) => r.region)
        .map((r) => ({ id: r.id, label: r.sourceLabel === "—" ? r.displayName : `ROW ${r.sourceRow ?? ""}`.trim() || r.sourceLabel, color: colorOf(r), active: r.id === activeRowId, region: r.region!, page: r.page, onClick: () => setActiveRowId(r.id) })),
    [rows, activeRowId],
  );

  if (review.isLoading) return <LoadingBlock label="Loading review…" />;
  if (review.error || !review.data) return <ErrorBlock error={review.error} onRetry={() => void review.refetch()} />;
  const rv = review.data;

  if (!batchId) {
    return (
      <Card padding={0}>
        <Empty title="Nothing needs review" icon="circle-check" action={<Btn primary icon="camera" onClick={() => router.push("/digitizer/capture")}>Capture or upload a document</Btn>}>
          Every document is either ready to import, imported, or still being read. When a row is blocked, low-confidence or matches an existing record it will appear here.
        </Empty>
      </Card>
    );
  }
  if (docQuery.isLoading) return <LoadingBlock label="Opening the document…" />;
  if (docQuery.error || !doc) return <ErrorBlock error={docQuery.error} onRetry={() => void docQuery.refetch()} />;

  const busy = doc.status === "queued" || doc.status === "processing";
  const isPdf = doc.mimeType === "application/pdf";
  const stMeta = STATUS_META[doc.status];

  const commitField = (field: AssessedField, text: string) => {
    if (!active) return;
    const next = text.trim();
    if ((field.value ?? "") === next) return setEditing(null);
    patch.mutate({ rowId: active.id, body: { data: { [field.field]: next === "" ? null : field.kind === "money" || field.kind === "int" ? (Number.isFinite(Number(next)) ? Number(next) : next) : next } } });
    setEditing(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* Which document */}
      {(rv.documents.length > 1 || !rv.documents.some((d) => d.id === doc.id)) && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#5B6675" }}>Document</span>
          {(rv.documents.some((d) => d.id === doc.id) ? rv.documents : [{ id: doc.id, name: doc.name, needsAttention: attention.length, status: doc.status }, ...rv.documents]).map((d) => (
            <div key={d.id} onClick={() => select(d.id)} style={{ height: "32px", display: "flex", alignItems: "center", gap: "7px", padding: "0 11px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, cursor: "pointer", border: `1px solid ${d.id === doc.id ? "#16A34A" : "#D5DAE2"}`, background: d.id === doc.id ? "#ECFDF3" : "#fff", color: d.id === doc.id ? "#15803D" : "#45505F" }}>
              {d.name}
              <span style={{ minWidth: "18px", height: "18px", padding: "0 5px", borderRadius: "9px", fontSize: "10.5px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#FEF3C7", color: "#B45309" }}>{d.needsAttention}</span>
            </div>
          ))}
        </div>
      )}

      {busy && (
        <Notice tone="blue" icon="refresh-cw">
          <strong>{doc.name}</strong> is still being read (stage: {doc.stage ?? "queued"}). This page updates by itself as soon as extraction finishes.
        </Notice>
      )}
      {doc.status === "failed" && (
        <Notice tone="red" icon="circle-alert">
          <strong>Could not read this document.</strong> {doc.failureReason} The original is kept —{" "}
          <span style={{ color: "#15803D", fontWeight: 700, cursor: "pointer" }} onClick={() => openDoc(doc.id, "Classification")}>reprocess it</span> or{" "}
          <span style={{ color: "#15803D", fontWeight: 700, cursor: "pointer" }} onClick={() => router.push("/digitizer/capture")}>retake the photo</span>.
        </Notice>
      )}
      {doc.reconciliation && !doc.reconciliation.ok && (
        <Notice tone="red" icon="triangle-alert">
          <strong>{doc.reconciliation.kind === "ledger" ? "The ledger does not reconcile." : "The invoice total does not reconcile."}</strong> {doc.reconciliation.message} Noxtill will not adjust either figure —{" "}
          <span style={{ color: "#15803D", fontWeight: 700, cursor: "pointer" }} onClick={() => openDoc(doc.id, "Table")}>read the original and set the correct figure</span>.
        </Notice>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "18px", alignItems: "start" }}>
        {/* Original */}
        <Card padding={0} style={{ overflow: "hidden" }}>
          <div style={{ padding: "13px 16px", borderBottom: "1px solid #EEF0F3", display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
            <DigitizerIcon name="file-text" size={15} style={{ color: "#45505F" }} />
            <div style={{ fontSize: "12.5px", fontWeight: 800 }}>{doc.name} · original</div>
            <div style={{ marginLeft: "auto", display: "flex", gap: "5px" }}>
              {(
                [
                  ["zoom-in", "Zoom in", () => setZoom((z) => Math.min(4, z + 0.25))],
                  ["zoom-out", "Zoom out", () => setZoom((z) => Math.max(0.5, z - 0.25))],
                  ["scan-line", "Reset zoom", () => setZoom(1)],
                ] as const
              ).map(([icon, label, run]) => (
                <div key={icon} title={label} onClick={run} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid #D5DAE2", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#45505F", cursor: "pointer", flexShrink: 0 }}>
                  <DigitizerIcon name={icon} size={14} />
                </div>
              ))}
            </div>
          </div>
          <OriginalView
            docId={doc.id}
            zoom={zoom}
            height={440}
            overlays={isPdf ? [] : overlays}
            pageFilter={null}
            footer={
              <div style={{ padding: "11px 16px", borderTop: "1px solid #EEF0F3", background: "#FCFCFD", fontSize: "11px", color: "#94A3B8", lineHeight: 1.5 }}>
                {isPdf
                  ? "This is a PDF, so it is shown as-is; row highlighting is available for photos."
                  : overlays.length
                    ? "Boxes show where the reader says each row sits — an approximation, so check the value against the paper. Click a box to select the row."
                    : "The reader did not report where the rows sit on this page, so nothing is highlighted."}{" "}
                Zoom changes the view only; the original file is never modified.
              </div>
            }
          />
        </Card>

        {/* Row */}
        <Card padding={0} style={{ overflow: "hidden" }}>
          <div style={{ padding: "13px 16px", borderBottom: "1px solid #EEF0F3", display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "12.5px", fontWeight: 800 }}>{active ? `Extracted · ${active.sourceLabel === "—" ? active.displayName : `row ${active.sourceRow ?? active.sourceLabel}`}` : "Extracted rows"}</div>
            <div style={{ marginLeft: "auto", display: "flex", gap: "7px", alignItems: "center", flexWrap: "wrap" }}>
              <Chip tone={stMeta.tone} style={{ height: "22px", fontSize: "10.5px" }}>{stMeta.label}</Chip>
              {attention.length > 0 && <Chip tone="amber" style={{ height: "22px", fontSize: "10.5px" }}>{plural(attention.length, "row")} need you</Chip>}
            </div>
          </div>

          {rows.length === 0 ? (
            <Empty title={busy ? "Waiting for the reader" : "No rows"} icon="list-checks">{busy ? "Rows appear here as soon as extraction finishes." : doc.status === "failed" ? "Nothing was extracted." : "This document has no extracted rows."}</Empty>
          ) : (
            <>
              <div style={{ padding: "11px 14px", borderBottom: "1px solid #EEF0F3", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={activeRowId ?? ""}
                  onChange={(e) => setActiveRowId(e.target.value)}
                  aria-label="Choose a row"
                  style={{ height: "32px", flex: "1 1 180px", minWidth: 0, border: "1px solid #D5DAE2", borderRadius: "8px", padding: "0 8px", fontSize: "12px", background: "#fff" }}
                >
                  {rows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.sourceLabel} · {r.displayName} — {ROW_STATE_META[r.state].label}
                    </option>
                  ))}
                </select>
                {active && (
                  <select
                    value={active.destination}
                    disabled={active.state === "imported"}
                    onChange={(e) => patch.mutate({ rowId: active.id, body: { destination: e.target.value as DigitizerDestination } })}
                    aria-label="Where this row goes"
                    style={{ height: "32px", border: "1px solid #D5DAE2", borderRadius: "8px", padding: "0 8px", fontSize: "12px", background: "#fff" }}
                  >
                    {(Object.keys(DESTINATION_LABELS) as DigitizerDestination[]).map((d) => (
                      <option key={d} value={d}>→ {DESTINATION_LABELS[d]}</option>
                    ))}
                  </select>
                )}
              </div>

              {active && (
                <div style={{ padding: "13px 14px", display: "flex", flexDirection: "column", gap: "9px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <Chip tone={ROW_STATE_META[active.state].tone}>{ROW_STATE_META[active.state].label}</Chip>
                    <Chip tone={LEVEL_META[active.level].tone}>{LEVEL_META[active.level].label} confidence</Chip>
                    {active.corrected && <Chip tone="blue">Corrected by you</Chip>}
                    <span style={{ ...monoStyle, fontSize: "10.5px", color: "#94A3B8", marginLeft: "auto" }}>{active.sourceLabel}</span>
                  </div>
                  {active.stateReason && active.state !== "ready" && active.state !== "imported" && (
                    <Notice tone={active.state === "needs_review" ? "amber" : "red"} icon="triangle-alert">{active.stateReason}</Notice>
                  )}

                  {active.fields.map((f) => {
                    const tone = f.issue || f.level === "unreadable" ? "red" : f.level === "low" ? "amber" : "neutral";
                    const isEditing = editing?.key === editKey && editing.field === f.field;
                    const locked = active.state === "imported";
                    return (
                      <div key={f.field} style={{ display: "flex", alignItems: "center", gap: "11px", padding: "11px 12px", borderRadius: "11px", flexWrap: "wrap", border: `1px solid ${toneBorder(tone)}`, background: tone === "red" ? "#FEF3F2" : tone === "amber" ? "#FFFBEB" : f.target === null ? "#FCFCFD" : "#fff" }}>
                        <div style={{ flex: "1 1 150px", minWidth: "130px" }}>
                          <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#94A3B8" }}>
                            {f.label}
                            {f.required && <span style={{ color: "#B42318" }}> *</span>}
                            {f.target === null && <span style={{ textTransform: "none", letterSpacing: 0 }}> · ignored on import</span>}
                          </div>
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editing.text}
                              onChange={(e) => setEditing({ key: editKey, field: f.field, text: e.target.value })}
                              onBlur={() => commitField(f, editing.text)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitField(f, editing.text);
                                if (e.key === "Escape") setEditing(null);
                              }}
                              style={{ marginTop: "4px", width: "100%", height: "30px", padding: "0 8px", border: "1px solid #16A34A", borderRadius: "7px", fontSize: "13px" }}
                            />
                          ) : (
                            <div
                              onClick={locked ? undefined : () => setEditing({ key: editKey, field: f.field, text: f.value ?? "" })}
                              title={locked ? "Already imported" : "Click to correct"}
                              style={{ fontSize: "13px", fontWeight: 700, marginTop: "4px", cursor: locked ? "default" : "text", color: f.level === "unreadable" ? "#B42318" : f.level === "low" ? "#B45309" : "#0F172A", fontStyle: f.blank ? "italic" : "normal", wordBreak: "break-word" }}
                            >
                              {f.blank ? (f.level === "unreadable" ? "Not readable — click to type it" : "Blank") : f.value}
                            </div>
                          )}
                          {!f.blank && f.normalized !== null && f.normalized !== f.value && (
                            <div style={{ fontSize: "10.5px", color: "#7A8798", marginTop: "3px" }}>
                              Will be stored as <span style={monoStyle}>{f.normalized}</span>
                              {f.normalization ? ` · ${f.normalization}` : ""}
                            </div>
                          )}
                          {f.original !== null && f.original !== f.value && (
                            <div style={{ fontSize: "10.5px", color: "#94A3B8", marginTop: "2px" }}>
                              The reader read: <span style={{ textDecoration: "line-through" }}>{f.original}</span>
                            </div>
                          )}
                          {f.original === null && f.value !== null && active.corrected && <div style={{ fontSize: "10.5px", color: "#94A3B8", marginTop: "2px" }}>The reader left this blank — you typed it.</div>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <Chip tone={LEVEL_META[f.level].tone} style={{ height: "20px", fontSize: "9.5px" }}>{LEVEL_META[f.level].label}</Chip>
                          {f.issue && <Chip tone="red" style={{ height: "20px", fontSize: "9.5px" }}>{f.issue}</Chip>}
                        </div>
                      </div>
                    );
                  })}

                  {active.duplicate && (
                    <div style={{ border: "1px solid #FDE49B", background: "#FFFBEB", borderRadius: "11px", padding: "11px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <DigitizerIcon name="copy-check" size={15} style={{ color: "#B45309" }} />
                        <div style={{ fontSize: "12px", fontWeight: 800 }}>{active.duplicate.level === "high" ? "Matches an existing record" : "Name matches an existing record"}</div>
                      </div>
                      <div style={{ fontSize: "11.5px", color: "#5B6675", marginTop: "5px", lineHeight: 1.5 }}>
                        {active.duplicate.basis} Existing: <strong>{active.duplicate.existing.name}</strong>
                        {active.duplicate.existing.phone ? ` · ${active.duplicate.existing.phone}` : ""}
                        {active.duplicate.existing.email ? ` · ${active.duplicate.existing.email}` : ""}.
                      </div>
                      <div style={{ display: "flex", gap: "6px", marginTop: "9px", flexWrap: "wrap" }}>
                        {(["use_existing", "create_new"] as const).map((d) => {
                          const on = active.duplicateDecision === d;
                          const blocked = d === "create_new" && active.duplicate!.entity === "Customers" && active.duplicate!.phoneMatch;
                          return (
                            <Btn key={d} small disabled={blocked} title={blocked ? "Phone numbers are unique — use the existing customer or correct the phone number" : undefined} primary={on} onClick={() => patch.mutate({ rowId: active.id, body: { duplicateDecision: on ? null : d } })}>
                              {d === "use_existing" ? "Use existing" : "Create new"}
                            </Btn>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {active.destination === "inventory" && active.product && (
                    <Notice tone="blue" icon="boxes">
                      Matches <strong>{active.product.name}</strong>{active.product.sku ? ` (${active.product.sku})` : ""}. Stock is currently {active.product.stockQty}; importing sets it to the counted quantity and records an adjustment.
                    </Notice>
                  )}
                </div>
              )}

              <div style={{ padding: "12px 16px", borderTop: "1px solid #EEF0F3", background: "#FCFCFD", display: "flex", gap: "7px", flexWrap: "wrap" }}>
                {active && active.state !== "imported" && (
                  <>
                    <Btn primary icon="check-check" disabled={patch.isPending || active.state === "ready" || active.state === "skipped"} onClick={() => patch.mutate({ rowId: active.id, body: { reviewed: true } })} title="Accept this row as it stands">
                      Accept row
                    </Btn>
                    <Btn onClick={() => patch.mutate({ rowId: active.id, body: { action: active.action === "skip" ? "commit" : "skip" } })}>{active.action === "skip" ? "Restore row" : "Skip row"}</Btn>
                  </>
                )}
                <Btn onClick={nextIssue}>Next issue</Btn>
                {attention.some((r) => r.state === "needs_review") && (
                  <Btn icon="check-check" disabled={acceptAll.isPending} onClick={() => acceptAll.mutate()} title="Accepts low-confidence rows only — never rows with errors or duplicates">
                    Accept all low-confidence
                  </Btn>
                )}
                <Btn onClick={() => openDoc(doc.id)} style={{ marginLeft: "auto" }}>Open document</Btn>
              </div>
            </>
          )}
        </Card>

        {/* Right: validation + duplicates */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
          <Card style={{ borderColor: "#FBD5D2" }} padding="16px 17px">
            <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              <DigitizerIcon name="triangle-alert" size={16} style={{ color: "#B42318" }} />
              <div style={{ fontSize: "13px", fontWeight: 800 }}>Validation</div>
              <div style={{ marginLeft: "auto" }}>
                <Chip tone={rv.totals.issues ? "red" : "green"} style={{ height: "22px", fontSize: "10.5px" }}>{rv.totals.issues ? plural(rv.totals.issues, "issue") : "No issues"}</Chip>
              </div>
            </div>
            {rv.issues.length === 0 ? (
              <div style={{ fontSize: "12px", color: "#7A8798", marginTop: "12px", lineHeight: 1.5 }}>No open document has a validation issue.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                {rv.issues.map((iss) => (
                  <div
                    key={`${iss.documentId}-${iss.code}`}
                    onClick={() =>
                      openPanel({
                        kicker: "Validation issue",
                        title: iss.title,
                        badge: `${iss.severity === "critical" ? "Critical" : "Warning"} · ${iss.detail}`,
                        badgeTone: iss.severity === "critical" ? "red" : "amber",
                        rows: [
                          ["Document", iss.documentName],
                          ["Severity", iss.severity === "critical" ? "Critical" : "Warning", iss.severity === "critical" ? "neg" : undefined],
                          ["Affected", plural(iss.affected, "row")],
                          ["Blocks import", iss.blocks === "document" ? "The whole document" : iss.blocks === "rows" ? "Only the affected rows" : "Nothing", iss.blocks === "none" ? "pos" : "neg"],
                          ...(iss.cause ? [["Likely cause", iss.cause] as [string, string]] : []),
                          ["Figure adjusted", "None", "pos"],
                        ],
                        primary: "Open affected rows",
                        onPrimary: () => {
                          closePanel();
                          select(iss.documentId, iss.rowIds[0]);
                        },
                        secondary: "Close",
                      })
                    }
                    style={{ display: "flex", alignItems: "flex-start", gap: "9px", padding: "10px 11px", borderRadius: "10px", border: "1px solid #EEF0F3", cursor: "pointer" }}
                  >
                    <Chip tone={iss.severity === "critical" ? "red" : "amber"} style={{ height: "19px", fontSize: "9px", flexShrink: 0 }}>{iss.severity === "critical" ? "Critical" : "Warning"}</Chip>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "11.5px", fontWeight: 700, lineHeight: 1.4 }}>{iss.title}</div>
                      <div style={{ fontSize: "10px", color: "#94A3B8", marginTop: "3px" }}>{iss.detail} · {iss.documentName}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card style={{ borderColor: "#FDE49B" }} padding="16px 17px">
            <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              <DigitizerIcon name="copy-check" size={16} style={{ color: "#B45309" }} />
              <div style={{ fontSize: "13px", fontWeight: 800 }}>Possible duplicates</div>
            </div>
            {rv.duplicates.length === 0 ? (
              <div style={{ fontSize: "12px", color: "#7A8798", marginTop: "12px", lineHeight: 1.5 }}>Nothing extracted matches a record you already have.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "9px", marginTop: "12px" }}>
                {rv.duplicates.map((d) => {
                  const onlyName = d.duplicate.level === "low";
                  return (
                    <div key={d.rowId} onClick={() => select(d.documentId, d.rowId)} style={{ border: "1px solid #EEF0F3", borderRadius: "11px", padding: "11px", cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <div style={{ fontSize: "12px", fontWeight: 700 }}>{d.rowName}</div>
                        <Chip tone={onlyName ? "neutral" : "amber"} style={{ height: "19px", fontSize: "9px" }}>{onlyName ? "Weak" : "Strong"}</Chip>
                        {d.decision && <Chip tone="green" style={{ height: "19px", fontSize: "9px" }}>{d.decision === "use_existing" ? "Use existing" : "Create new"}</Chip>}
                      </div>
                      <div style={{ fontSize: "10.5px", color: "#5B6675", marginTop: "5px", lineHeight: 1.45 }}>{d.duplicate.basis}</div>
                      <div style={{ display: "flex", gap: "6px", marginTop: "9px", flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                        {(["use_existing", "create_new"] as const).map((dec) => {
                          const blocked = dec === "create_new" && d.duplicate.entity === "Customers" && d.duplicate.phoneMatch;
                          return (
                            <Btn
                              key={dec}
                              small
                              disabled={blocked}
                              title={blocked ? "Phone numbers are unique — use the existing customer or correct the phone number" : undefined}
                              onClick={async () => {
                                try {
                                  const updated = await updateDigitizerDocumentRow(d.documentId, d.rowId, { duplicateDecision: d.decision === dec ? null : dec });
                                  applyDoc(updated);
                                  notify("Decision recorded", "Recorded against the row with who chose it and when.");
                                } catch (e) {
                                  notifyError("Could not record the decision", e instanceof Error ? e.message : "Please try again.");
                                }
                              }}
                            >
                              {dec === "use_existing" ? "Use existing" : "Create new"}
                            </Btn>
                          );
                        })}
                        <Btn small onClick={() => select(d.documentId, d.rowId)}>Compare</Btn>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ fontSize: "10.5px", color: "#94A3B8", marginTop: "12px", lineHeight: 1.5 }}>Nothing is merged automatically. Merging two real people into one record is painful to undo.</div>
          </Card>

          {doc.reconciliation && (
            <Card padding="14px 16px">
              <div style={{ fontSize: "12.5px", fontWeight: 800 }}>{doc.reconciliation.kind === "ledger" ? "Ledger" : "Invoice"} arithmetic</div>
              <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "5px" }}>
                {doc.reconciliation.components.map((c) => (
                  <div key={c.label} style={{ display: "flex", fontSize: "11.5px" }}>
                    <span style={{ color: "#5B6675" }}>{c.label}</span>
                    <span style={{ marginLeft: "auto", fontWeight: 700 }}>{formatMoney(c.value, doc.currency)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", fontSize: "11.5px", borderTop: "1px solid #EEF0F3", paddingTop: "5px" }}>
                  <span style={{ color: "#5B6675" }}>Calculated</span>
                  <span style={{ marginLeft: "auto", fontWeight: 800 }}>{formatMoney(doc.reconciliation.calculated, doc.currency)}</span>
                </div>
                <div style={{ display: "flex", fontSize: "11.5px" }}>
                  <span style={{ color: "#5B6675" }}>{doc.reconciliation.kind === "ledger" ? "Written closing balance" : "Printed total"}</span>
                  <span style={{ marginLeft: "auto", fontWeight: 800, color: doc.reconciliation.ok ? "#15803D" : "#B42318" }}>{doc.reconciliation.stated === null ? "not read" : formatMoney(doc.reconciliation.stated, doc.currency)}</span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
