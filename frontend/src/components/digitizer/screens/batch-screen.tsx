"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { approveDigitizerDocuments, fetchDigitizerBatches } from "@/lib/digitizer-api";
import { DigitizerIcon } from "../digitizer-icon";
import { useDigitizerStore } from "../digitizer-store";
import { DIGITIZER_KEY, useDigitizerData } from "../digitizer-data";
import { BarRow, Btn, Card, CardHeader, Chip, Empty, ErrorBlock, Kpi, KpiGrid, LoadingBlock, plural, toneBar, whenLabel } from "../digitizer-ui";
import type { Tone } from "../digitizer-types";

export function BatchScreen() {
  const router = useRouter();
  const { notify, notifyError, openConfirm, openDoc } = useDigitizerStore();
  const { refresh } = useDigitizerData();
  const [groupId, setGroupId] = useState<string | undefined>(undefined);

  const q = useQuery({
    queryKey: [DIGITIZER_KEY, "batches", groupId ?? "latest"],
    queryFn: () => fetchDigitizerBatches(groupId),
    refetchInterval: (query) => ((query.state.data?.group?.processing ?? 0) > 0 ? 3000 : false),
  });
  const approve = useMutation({
    mutationFn: (ids: string[]) => approveDigitizerDocuments(ids),
    onSuccess: (out) => {
      refresh();
      notify(`${plural(out.approved.length, "document")} approved`, out.rejected.length ? `${out.rejected.length} could not be approved: ${out.rejected.map((r) => r.reason).join("; ")}` : "Approved for import — approval is not an import. Nothing has been written.");
    },
    onError: (e: unknown) => notifyError("Could not approve", e instanceof Error ? e.message : "Please try again."),
  });

  if (q.isLoading) return <LoadingBlock label="Loading batches…" />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const { groups, group } = q.data;

  if (!group) {
    return (
      <Card padding={0}>
        <Empty title="No batches yet" icon="files" action={<Btn primary icon="upload" onClick={() => router.push("/digitizer/capture")}>Upload files together</Btn>}>
          Every time you upload or capture files together they become one batch. Here you see how the batch was classified, which documents are clean enough to approve in bulk, and what to look at first.
        </Empty>
      </Card>
    );
  }

  const maxFiles = Math.max(1, ...group.classification.map((c) => c.files));
  const kindTone = (key: string, handwriting: string): Tone => (key === "unknown" || key === "other" ? "red" : handwriting === "printed" ? "green" : "amber");
  const gatesOk = group.gates.every((g) => g.total > 0 && g.passing === g.total);
  const ids = group.approvable.ids;

  const bulkApprove = () =>
    openConfirm({
      title: `Approve ${plural(ids.length, "document")} in bulk?`,
      tone: "green",
      icon: "check-check",
      body: `These passed every gate: all records valid, no critical errors, confidence above your threshold, and no ambiguous duplicates. The other ${plural(group.individual, "document")} go to individual review — bulk approval is not offered for them.`,
      rows: [
        ["Approved in bulk", plural(ids.length, "document")],
        ["Sent to individual review", plural(group.individual, "document")],
        ["Records this would create or update", String(group.approvable.records)],
        ["Ambiguous duplicates included", "0", "pos"],
        ["Critical errors included", "0", "pos"],
        ["Still requires import", "Yes — this is approval only, nothing is written"],
      ],
      primary: `Approve ${ids.length}`,
      cancel: "Cancel",
      onConfirm: () => approve.mutateAsync(ids),
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {groups.length > 1 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#5B6675" }}>Batch</span>
          {groups.slice(0, 12).map((g) => {
            const on = g.groupId === group.groupId;
            return (
              <div key={g.groupId} onClick={() => setGroupId(g.groupId)} style={{ height: "32px", display: "flex", alignItems: "center", gap: "7px", padding: "0 11px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? "#16A34A" : "#D5DAE2"}`, background: on ? "#ECFDF3" : "#fff", color: on ? "#15803D" : "#45505F" }}>
                {plural(g.files, "file")} · {whenLabel(g.createdAt)}
                {g.uploadedBy ? ` · ${g.uploadedBy.name}` : ""}
              </div>
            );
          })}
        </div>
      )}

      <KpiGrid>
        <Kpi label="Files" value={String(group.files)} meta="uploaded together" />
        <Kpi label="Pages" value={String(group.pages)} meta={`across ${plural(group.files, "file")}`} />
        <Kpi label="Processing" value={String(group.processing)} meta={group.processing ? "still being read" : "none running"} tone={group.processing ? "blue" : "neutral"} />
        <Kpi label="Ready" value={String(group.ready)} meta="clean and matched" tone="green" />
        <Kpi label="Review" value={String(group.needsReview)} meta="low confidence, duplicate or blocked" tone={group.needsReview ? "amber" : "neutral"} />
        <Kpi label="Failed" value={String(group.failed)} meta={group.failed ? "reason kept on each" : "none"} tone={group.failed ? "red" : "neutral"} />
      </KpiGrid>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "18px", alignItems: "start" }}>
        <Card>
          <CardHeader title="Batch classification" note={`${plural(group.files, "file")} uploaded`} />
          <div style={{ display: "flex", flexDirection: "column", gap: "11px", marginTop: "15px" }}>
            {group.classification.map((c) => (
              <BarRow key={c.key} label={c.label} meta={c.handwriting} value={plural(c.files, "file")} width={(c.files / maxFiles) * 100} tone={kindTone(c.key, c.handwriting)} onClick={() => router.push(`/digitizer/history?kind=${c.key}`)} />
            ))}
          </div>
        </Card>

        <Card style={{ borderColor: "#FDE49B" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <DigitizerIcon name="shield-check" size={16} style={{ color: "#B45309" }} />
            <div style={{ fontSize: "13.5px", fontWeight: 800 }}>Bulk approval gate</div>
          </div>
          <div style={{ fontSize: "12px", color: "#45505F", lineHeight: 1.55, marginTop: "10px" }}>Bulk approval is only offered when every condition below is met. When any one fails, that document goes to individual review instead.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "13px" }}>
            {group.gates.map((g) => {
              const ok = g.total > 0 && g.passing === g.total;
              return (
                <div key={g.key} style={{ display: "flex", alignItems: "center", gap: "9px", padding: "10px 11px", borderRadius: "10px", border: "1px solid #EEF0F3" }}>
                  <DigitizerIcon name={ok ? "circle-check" : "triangle-alert"} size={15} style={{ color: ok ? "#15803D" : "#B45309" }} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: "11.5px", fontWeight: 600, color: "#45505F", lineHeight: 1.4 }}>{g.label}</div>
                  <Chip tone={ok ? "green" : "amber"} style={{ height: "20px", fontSize: "9.5px" }}>{g.passing} of {g.total}</Chip>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap", alignItems: "center" }}>
            {group.individual > 0 && <Btn onClick={() => router.push("/digitizer/review")}>Review {group.individual} individually</Btn>}
            <Btn primary disabled={ids.length === 0 || approve.isPending} onClick={bulkApprove}>{ids.length ? `Approve ${ids.length} clean` : "Nothing to approve"}</Btn>
            {group.approved > 0 && <span style={{ fontSize: "11px", color: "#15803D", fontWeight: 700 }}>{group.approved} already approved</span>}
          </div>
          {ids.length === 0 && !gatesOk && group.processing === 0 && <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "10px", lineHeight: 1.5 }}>No document in this batch is clean enough for bulk approval — each needs individual review.</div>}
        </Card>
      </div>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={{ padding: "15px 18px", borderBottom: "1px solid #EEF0F3", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "14px", fontWeight: 800 }}>Review priority</div>
          <div style={{ fontSize: "11px", color: "#94A3B8" }}>Critical first, then low confidence, duplicates, then everything else</div>
        </div>
        {group.priority.map((p) => (
          <div key={p.key} onClick={() => (p.key === "rest" ? router.push("/digitizer/import") : router.push("/digitizer/review"))} style={{ padding: "14px 18px", borderTop: "1px solid #F3F4F7", cursor: "pointer", background: p.tone === "red" && p.count ? "#FEFBFB" : "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ width: "26px", height: "26px", flex: "0 0 26px", borderRadius: "8px", background: p.tone === "red" ? "#FEE4E2" : p.tone === "amber" ? "#FEF3C7" : "#ECFDF3", color: p.tone === "red" ? "#B42318" : p.tone === "amber" ? "#B45309" : "#15803D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800 }}>{p.rank}</div>
              <div style={{ flex: "1 1 260px", minWidth: "220px" }}>
                <div style={{ fontSize: "12.5px", fontWeight: 800 }}>{p.label}</div>
                <div style={{ fontSize: "11px", color: "#5B6675", marginTop: "4px", lineHeight: 1.45 }}>{p.detail}</div>
              </div>
              <Chip tone={p.count ? p.tone : "neutral"} style={{ height: "24px", fontSize: "11px" }}>{p.count}</Chip>
            </div>
          </div>
        ))}
      </Card>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={{ padding: "15px 18px", borderBottom: "1px solid #EEF0F3", fontSize: "14px", fontWeight: 800 }}>Documents in this batch</div>
        {group.documents.map((d) => (
          <div key={d.id} onClick={() => openDoc(d.id)} style={{ padding: "11px 18px", borderTop: "1px solid #F3F4F7", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", flexWrap: "wrap" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: toneBar(d.status === "failed" ? "red" : d.status === "ready" || d.status === "imported" ? "green" : d.status === "processing" || d.status === "queued" ? "blue" : "amber") }} />
            <div style={{ fontSize: "12.5px", fontWeight: 700, flex: "1 1 200px" }}>{d.name}</div>
            <div style={{ fontSize: "11.5px", color: "#7A8798" }}>{d.kindLabel} · {d.counts.rows} records</div>
            {d.approvedAt && <Chip tone="green" style={{ height: "20px", fontSize: "9.5px" }}>Approved</Chip>}
            <Chip tone="neutral" style={{ height: "20px", fontSize: "9.5px" }}>{d.status.replace(/_/g, " ")}</Chip>
          </div>
        ))}
      </Card>
    </div>
  );
}
