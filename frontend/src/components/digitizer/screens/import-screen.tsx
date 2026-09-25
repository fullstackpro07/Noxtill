"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commitDigitizerDocument, fetchDigitizerImport, type ImportOverviewResponse } from "@/lib/digitizer-api";
import { DigitizerIcon } from "../digitizer-icon";
import { useDigitizerStore } from "../digitizer-store";
import { DIGITIZER_KEY, useDigitizerData } from "../digitizer-data";
import { Btn, Card, CardFooterNote, Chip, Empty, ErrorBlock, LoadingBlock, Notice, STATUS_META, StatusChip, TableCard, Th, monoStyle, plural, theadStyle, toneInk, whenLabel } from "../digitizer-ui";
import type { Tone } from "../digitizer-types";

const RULES: [string, string, string, Tone][] = [
  ["On a duplicate", "The row is held until you choose to use the existing record or create a new one", "Ask", "amber"],
  ["On a missing required value", "That row is blocked; the rest of the document imports", "Block row", "amber"],
  ["On a new value", "A new record is created", "Create", "green"],
  ["On low confidence", "The row waits until you accept or correct it", "Hold", "blue"],
];

export function ImportScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { refresh } = useDigitizerData();
  const { openPanel, closePanel, openConfirm, openDoc, notify } = useDigitizerStore();
  const docParam = params.get("doc") ?? undefined;

  const q = useQuery({ queryKey: [DIGITIZER_KEY, "import", docParam ?? "auto"], queryFn: () => fetchDigitizerImport(docParam) });

  const commit = useMutation({
    mutationFn: (id: string) => commitDigitizerDocument(id),
    onSuccess: ({ job, document }) => {
      queryClient.setQueryData([DIGITIZER_KEY, "doc", document.id], document);
      refresh();
      notify(
        `${job.created + job.updated} record${job.created + job.updated === 1 ? "" : "s"} imported`,
        `${job.created} created · ${job.updated} updated · ${job.skipped} skipped${job.failed ? ` · ${job.failed} failed (reasons kept)` : ""}${job.blocked ? ` · ${job.blocked} left in review` : ""}. Job ${job.id}.`,
      );
    },
  });

  const mappingSummary = useMemo(() => {
    const m = q.data?.document?.mapping ?? [];
    return { mapped: m.filter((x) => x.status === "mapped").length, total: m.length };
  }, [q.data]);

  if (q.isLoading) return <LoadingBlock label="Loading the import preview…" />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const { document: doc, candidates, jobs } = q.data;
  const p = doc?.importPreview;

  const confirmImport = () => {
    if (!doc || !p) return;
    const writes = p.counts.create + p.counts.update;
    openConfirm({
      title: `Import ${plural(writes, "record")}?`,
      tone: p.highRisk ? "amber" : "green",
      icon: "file-input",
      body: `This writes ${p.counts.create} new and ${p.counts.update} updated record${writes === 1 ? "" : "s"}, exactly as previewed. ${p.counts.skip ? `${plural(p.counts.skip, "row")} you decided to skip stay skipped. ` : ""}${p.counts.blocked ? `${plural(p.counts.blocked, "blocked row")} stay in review. ` : ""}${p.highRisk ? "This includes credit balances — high-risk data — so please check the figures against the original first. " : ""}Nothing else changes.`,
      rows: [
        ["Create", String(p.counts.create)],
        ["Update", String(p.counts.update)],
        ["Skip", String(p.counts.skip)],
        ["Blocked", `${p.counts.blocked}${p.counts.blocked ? " · stay for review" : ""}`, p.counts.blocked ? "neg" : undefined],
        ["Goes to", p.byDestination.map((d) => d.label).join(" · ")],
        ["Source", doc.name],
        ["Rollback", "Not available — undo imported records in their own module", "neg"],
      ],
      primary: `Import ${plural(writes, "record")}`,
      cancel: "Back to preview",
      onConfirm: () => commit.mutateAsync(doc.id),
    });
  };

  if (!doc) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        <Card padding={0}>
          <Empty title="Nothing to import" icon="file-input" action={<Btn primary icon="camera" onClick={() => router.push("/digitizer/capture")}>Capture or upload a document</Btn>}>
            Documents that have been read and passed review appear here, with exactly what an import would create. Import is the only step that writes.
          </Empty>
        </Card>
        {jobs.length > 0 && <JobsTable jobs={jobs} onOpen={(id) => openDoc(id, "Import")} openPanel={openPanel} closePanel={closePanel} />}
      </div>
    );
  }

  const writes = (p?.counts.create ?? 0) + (p?.counts.update ?? 0);
  const previewCounts: [string, number, Tone][] = p
    ? [
        ["Create", p.counts.create, "green"],
        ["Update", p.counts.update, "neutral"],
        ["Skip", p.counts.skip, "amber"],
        ["Blocked", p.counts.blocked, "red"],
        ["Written", p.counts.written, "green"],
      ]
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {candidates.length > 1 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#5B6675" }}>Document</span>
          {candidates.map((c) => (
            <div key={c.id} onClick={() => router.replace(`/digitizer/import?doc=${c.id}`)} style={{ height: "32px", display: "flex", alignItems: "center", gap: "7px", padding: "0 11px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, cursor: "pointer", border: `1px solid ${c.id === doc.id ? "#16A34A" : "#D5DAE2"}`, background: c.id === doc.id ? "#ECFDF3" : "#fff", color: c.id === doc.id ? "#15803D" : "#45505F" }}>
              {c.name}
              <Chip tone={STATUS_META[c.status].tone} style={{ height: "18px", fontSize: "9px" }}>{c.create + c.update} to write</Chip>
              {c.approved && <Chip tone="green" style={{ height: "18px", fontSize: "9px" }}>Approved</Chip>}
            </div>
          ))}
        </div>
      )}

      <Card style={{ borderColor: "#FDE49B" }} padding="15px 17px">
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ width: "30px", height: "30px", flex: "0 0 30px", borderRadius: "9px", background: "#FFFBEB", color: "#B45309", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <DigitizerIcon name="shield-check" size={16} />
          </div>
          <div style={{ flex: 1, minWidth: "240px" }}>
            <div style={{ fontSize: "13px", fontWeight: 800 }}>This is the only step that writes</div>
            <div style={{ fontSize: "11.5px", color: "#5B6675", marginTop: "3px" }}>Extraction, validation and preview have written nothing. Confirming an import creates exactly the records shown below — no more, no fewer.</div>
          </div>
          <StatusChip status={doc.status} />
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: "18px", alignItems: "start" }}>
        <Card padding={0} style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 17px", borderBottom: "1px solid #EEF0F3", display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "13.5px", fontWeight: 800 }}>Field mapping</div>
            <div style={{ marginLeft: "auto" }}>
              <Chip tone="green" style={{ height: "22px", fontSize: "10.5px" }}>Mapped {mappingSummary.mapped} of {mappingSummary.total}</Chip>
            </div>
          </div>
          {doc.mapping.length === 0 ? (
            <Empty title="Nothing to map" icon="table-2">No values were extracted from this document.</Empty>
          ) : (
            <TableCard minWidth="480px">
              <thead>
                <tr style={theadStyle}>
                  <Th first>Source field</Th>
                  <Th>Noxtill field</Th>
                  <Th>Rows</Th>
                  <Th last>Status</Th>
                </tr>
              </thead>
              <tbody>
                {doc.mapping.map((m) => (
                  <tr key={`${m.destination}-${m.source}`} style={{ borderBottom: "1px solid #F3F4F7", background: m.status === "ignored" ? "#FCFCFD" : "#fff" }}>
                    <td style={{ padding: "11px 12px 11px 17px", fontSize: "12px", fontWeight: 700, ...monoStyle }}>{m.source}</td>
                    <td style={{ padding: "11px 12px", fontSize: "12px", color: "#45505F" }}>{m.target ?? "Not mapped"}</td>
                    <td style={{ padding: "11px 12px", fontSize: "11.5px", color: "#94A3B8" }}>{m.rows}</td>
                    <td style={{ padding: "11px 17px 11px 12px" }}>
                      <Chip tone={m.status === "mapped" ? "green" : "neutral"} style={{ height: "21px", fontSize: "10px" }}>{m.status === "mapped" ? "Mapped" : "Ignored"}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          )}
          <CardFooterNote>Mapping is fixed by the document type. A value with no place in Noxtill is ignored, not force-fitted into the nearest field.</CardFooterNote>
        </Card>

        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
          <Card padding="16px 17px">
            <div style={{ fontSize: "13.5px", fontWeight: 800 }}>Import rules</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "12px" }}>
              {RULES.map(([label, detail, value, tone]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 10px", borderRadius: "10px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 700 }}>{label}</div>
                    <div style={{ fontSize: "10.5px", color: "#94A3B8", marginTop: "2px", lineHeight: 1.4 }}>{detail}</div>
                  </div>
                  <Chip tone={tone} style={{ height: "21px", fontSize: "10px" }}>{value}</Chip>
                </div>
              ))}
            </div>
          </Card>

          <Card padding="16px 17px">
            <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              <div style={{ fontSize: "13.5px", fontWeight: 800 }}>Import preview</div>
              <div style={{ marginLeft: "auto", fontSize: "10.5px", color: "#94A3B8" }}>{plural(doc.counts.rows, "extracted record")}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: "10px", marginTop: "13px" }}>
              {previewCounts.map(([label, value, tone]) => (
                <div key={label} style={{ border: `1px solid ${tone === "red" ? "#FBD5D2" : tone === "amber" ? "#FDE49B" : "#EEF0F3"}`, borderRadius: "10px", padding: "11px", background: tone === "red" && value ? "#FEF3F2" : tone === "amber" && value ? "#FFFBEB" : "#fff" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#94A3B8" }}>{label}</div>
                  <div style={{ fontSize: "17px", fontWeight: 800, marginTop: "5px", fontVariantNumeric: "tabular-nums", color: value ? toneInk(tone) : "#0F172A" }}>{value}</div>
                </div>
              ))}
            </div>
            {p && p.byDestination.length > 1 && (
              <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "5px" }}>
                {p.byDestination.map((d) => (
                  <div key={d.destination} style={{ display: "flex", fontSize: "11.5px", color: "#5B6675" }}>
                    <span style={{ fontWeight: 700 }}>{d.label}</span>
                    <span style={{ marginLeft: "auto" }}>{d.counts.create} create · {d.counts.update} update · {d.counts.skip} skip · {d.counts.blocked} blocked</span>
                  </div>
                ))}
              </div>
            )}
            {p && p.counts.blocked > 0 && (
              <div style={{ fontSize: "11.5px", color: "#B45309", marginTop: "12px", lineHeight: 1.5 }}>
                Blocked: {[p.blocked.lowConfidence && `${p.blocked.lowConfidence} low confidence`, p.blocked.duplicates && `${p.blocked.duplicates} waiting for a duplicate decision`, p.blocked.invalid && `${p.blocked.invalid} missing or invalid`, p.blocked.reconciliation && `${p.blocked.reconciliation} on a document that does not reconcile`, p.blocked.other && `${p.blocked.other} other`].filter(Boolean).join(" · ")}.
              </div>
            )}
            {p?.reason && !p.canImport && <div style={{ marginTop: "12px" }}><Notice tone="amber" icon="info">{p.reason}</Notice></div>}
            <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
              {p && p.counts.blocked > 0 && <Btn onClick={() => router.push(`/digitizer/review?batch=${doc.id}`)}>Review {p.counts.blocked} blocked</Btn>}
              <Btn primary icon="file-input" disabled={!p?.canImport || commit.isPending} onClick={confirmImport}>
                {commit.isPending ? "Importing…" : `Import ${plural(writes, "record")}`}
              </Btn>
            </div>
            {doc.approvedAt && <div style={{ fontSize: "10.5px", color: "#94A3B8", marginTop: "10px" }}>Approved {whenLabel(doc.approvedAt)}{doc.approvedBy ? ` by ${doc.approvedBy.name}` : ""} — approval is not an import.</div>}
          </Card>
        </div>
      </div>

      <JobsTable jobs={jobs} onOpen={(id) => openDoc(id, "Import")} openPanel={openPanel} closePanel={closePanel} />
    </div>
  );
}

function JobsTable({
  jobs,
  onOpen,
  openPanel,
  closePanel,
}: {
  jobs: ImportOverviewResponse["jobs"];
  onOpen: (documentId: string) => void;
  openPanel: ReturnType<typeof useDigitizerStore.getState>["openPanel"];
  closePanel: () => void;
}) {
  const tone = (s: "completed" | "partial" | "failed"): Tone => (s === "completed" ? "green" : s === "partial" ? "amber" : "red");
  return (
    <Card padding={0} style={{ overflow: "hidden" }}>
      <div style={{ padding: "15px 18px", borderBottom: "1px solid #EEF0F3", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <div style={{ fontSize: "14px", fontWeight: 800 }}>Import jobs</div>
        <div style={{ fontSize: "11px", color: "#94A3B8" }}>A partial import never re-imports a record that already succeeded</div>
      </div>
      {jobs.length === 0 ? (
        <Empty title="No imports yet" icon="file-input">Each confirmed import is recorded here with what it created, updated, skipped and failed.</Empty>
      ) : (
        <TableCard minWidth="1000px">
          <thead>
            <tr style={theadStyle}>
              <Th first>Job</Th>
              <Th>Source document</Th>
              <Th>Destination</Th>
              <Th align="center">Created</Th>
              <Th align="center">Updated</Th>
              <Th align="center">Skipped</Th>
              <Th align="center">Failed</Th>
              <Th>Status</Th>
              <Th align="right" last>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr
                key={j.id}
                onClick={() =>
                  openPanel({
                    kicker: "Import job",
                    title: `${j.id} · ${j.destinationLabels.join(" · ")}`,
                    badge: j.status === "completed" ? "Completed" : j.status === "partial" ? "Partial" : "Failed",
                    badgeTone: tone(j.status),
                    rows: [
                      ["Source document", j.documentName],
                      ["Imported", whenLabel(j.at)],
                      ["Created", String(j.created)],
                      ["Updated", String(j.updated)],
                      ["Skipped", String(j.skipped)],
                      ["Failed", String(j.failed), j.failed ? "neg" : "pos"],
                      ["Left in review", String(j.blocked)],
                      ["Re-import risk", "None — rows that succeeded are never imported again", "pos"],
                      ["Rollback", "Not available — undo imported records in their own module"],
                      ...j.failures.slice(0, 8).map((f, i) => [`Failure ${i + 1}`, f.reason, "neg"] as [string, string, "neg"]),
                    ],
                    note: "Every row records its own outcome, so a failed row keeps its reason and a retry only touches rows that have not yet succeeded.",
                    primary: "Open document",
                    onPrimary: () => {
                      closePanel();
                      onOpen(j.documentId);
                    },
                    secondary: "Close",
                  })
                }
                style={{ borderBottom: "1px solid #F3F4F7", cursor: "pointer", background: j.status === "failed" ? "#FEFBFB" : j.status === "partial" ? "#FFFDF5" : "#fff" }}
              >
                <td style={{ padding: "11px 12px 11px 18px", fontSize: "11.5px", fontWeight: 700, ...monoStyle }}>{j.id}</td>
                <td style={{ padding: "11px 12px", fontSize: "12px", color: "#45505F" }}>{j.documentName}</td>
                <td style={{ padding: "11px 12px", fontSize: "12px", color: "#45505F" }}>{j.destinationLabels.join(" · ")}</td>
                <td style={{ padding: "11px 12px", textAlign: "center", fontSize: "12px", fontWeight: 700 }}>{j.created}</td>
                <td style={{ padding: "11px 12px", textAlign: "center", fontSize: "12px" }}>{j.updated}</td>
                <td style={{ padding: "11px 12px", textAlign: "center", fontSize: "12px", color: "#7A8798" }}>{j.skipped}</td>
                <td style={{ padding: "11px 12px", textAlign: "center" }}>
                  <span style={{ display: "inline-flex", padding: "0 7px", height: "20px", alignItems: "center", borderRadius: "6px", fontSize: "11px", fontWeight: 800, background: j.failed ? "#FEF3F2" : "transparent", color: j.failed ? "#B42318" : "#7A8798" }}>{j.failed}</span>
                </td>
                <td style={{ padding: "11px 12px" }}><Chip tone={tone(j.status)} style={{ height: "21px", fontSize: "10px" }}>{j.status === "completed" ? "Completed" : j.status === "partial" ? "Partial" : "Failed"}</Chip></td>
                <td style={{ padding: "11px 18px 11px 12px", textAlign: "right" }}>
                  <Btn onClick={(e) => { e.stopPropagation(); onOpen(j.documentId); }}>{j.status === "completed" ? "View" : j.failures.length ? "View errors" : "View"}</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </Card>
  );
}
