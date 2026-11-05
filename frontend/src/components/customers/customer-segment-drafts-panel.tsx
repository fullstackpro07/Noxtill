"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SegmentRuleBuilder } from "./segment-rule-builder";
import { fetchCustomerSegmentDrafts, fetchCustomerSegmentDraft, updateCustomerSegmentDraft, rejectCustomerSegmentDraft, submitCustomerSegmentDraft, approveCustomerSegmentDraft, withdrawCustomerSegmentDraft, reopenCustomerSegmentDraft, type CustomerSegmentDraft } from "@/lib/customer-intelligence-api";

const fields = ["visitCount", "lastVisitAt", "createdAt", "consentMarketing", "optedOut"] as const;
const box = { background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" };
function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => { window.removeEventListener("hashchange", listener); window.removeEventListener("popstate", listener); };
}
const focusedDraft = () => /^#segment-draft-([a-f0-9-]{36})$/i.exec(window.location.hash)?.[1] ?? "";

export function CustomerSegmentDraftsPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["customer-segment-drafts"], queryFn: fetchCustomerSegmentDrafts, retry: false });
  const focusedId = useSyncExternalStore(subscribeHash, focusedDraft, () => "");
  const focused = useQuery({ queryKey: ["customer-segment-drafts", focusedId], queryFn: () => fetchCustomerSegmentDraft(focusedId), enabled: !!focusedId && !!query.data && !query.data.some((draft) => draft.id === focusedId), retry: false });
  const drafts = focused.data && !query.data?.some((draft) => draft.id === focused.data.id) ? [focused.data, ...(query.data ?? [])] : query.data;
  if (query.error instanceof ApiError && query.error.status === 403) return null;
  return <section aria-label="Customer agent segment drafts" className="rounded-[16px] p-[17px]" style={box}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-[15px] font-extrabold">Customer agent · segment review</h2><Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["customer-segment-drafts"] })} disabled={query.isFetching || focused.isFetching}>Refresh proposals</Button></div>
    <p className="mt-1 text-[12px]" style={{ color: "var(--app-text-muted)" }}>Edit a rule proposal then submit it to the <Link href="/dashboard/actions" className="underline">Action Center</Link>. An exact human approval saves or updates a canonical Segment. Editing that Segment later invalidates its agent approval. No campaigns or messages are started.</p>
    {focused.error && <p role="alert" className="mt-3 text-[12px]">Could not load the linked proposal: {focused.error.message}</p>}
    {query.isPending ? <p className="mt-3 text-[12px]">Loading draft proposals…</p> : query.error ? <p role="alert" className="mt-3 text-[12px]">{query.error.message}</p> : !drafts?.length ? <p className="mt-3 text-[12px]">No segment drafts prepared. Run a <Link href="/customers/insights" className="underline" style={{ color: "var(--app-primary)" }}>Customer Intelligence review</Link> and prepare its rule proposal.</p> : <>
      <p className="mt-3 text-[11px]" style={{ color: "var(--app-text-muted)" }}>Showing the latest 20 prepared recommendations plus the linked proposal when older. Match counts are recalculated on load and before approval. Counts can change; this is a dynamic rule definition, not a frozen recipient list or send authorization.</p>
      {drafts.map((draft) => <DraftEditor key={`${draft.id}:${draft.current.version}:${draft.state}`} draft={draft} />)}
    </>}
  </section>;
}

function DraftEditor({ draft }: { draft: CustomerSegmentDraft }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(draft.current.name);
  const [rules, setRules] = useState(draft.current.rules);
  const [reason, setReason] = useState("");
  const changed = name !== draft.current.name || JSON.stringify(rules) !== JSON.stringify(draft.current.rules);
  const refresh = async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["customer-segment-drafts"] }), queryClient.invalidateQueries({ queryKey: ["customer-agent-runs"] }), queryClient.invalidateQueries({ queryKey: ["segments"] }), queryClient.invalidateQueries({ queryKey: ["action-center"] })]);
  };
  const fail = (error: Error) => toast.error(error instanceof ApiError ? error.message : "Could not update the draft.");
  const save = useMutation({ mutationFn: () => updateCustomerSegmentDraft(draft.id, { expectedVersion: draft.current.version, name, rules, reason }), onSuccess: async () => { await refresh(); toast.success("New draft revision saved. No Segment was created."); }, onError: fail });
  const reject = useMutation({ mutationFn: () => rejectCustomerSegmentDraft(draft.id, { expectedVersion: draft.current.version, reason }), onSuccess: refresh, onError: fail });
  const preview = { expectedVersion: draft.current.version, expectedPayloadHash: draft.current.payloadHash, expectedCountsHash: draft.countsHash };
  const submit = useMutation({ mutationFn: () => submitCustomerSegmentDraft(draft.id, preview), onSuccess: async () => { await refresh(); toast.success("Exact proposal submitted to Action Center."); }, onError: fail });
  const approve = useMutation({ mutationFn: () => approveCustomerSegmentDraft(draft.id, { ...preview, expectedCountsHash: draft.submission?.countsHash ?? "" }), onSuccess: async () => { await refresh(); toast.success("Approved Segment saved and its definition verified. No messages sent."); }, onError: fail });
  const withdraw = useMutation({ mutationFn: () => withdrawCustomerSegmentDraft(draft.id, { expectedVersion: draft.current.version, reason }), onSuccess: refresh, onError: fail });
  const reopen = useMutation({ mutationFn: () => reopenCustomerSegmentDraft(draft.id, { expectedVersion: draft.current.version, reason }), onSuccess: refresh, onError: fail });
  const pending = save.isPending || reject.isPending || submit.isPending || approve.isPending || withdraw.isPending || reopen.isPending;
  const audienceChanged = draft.state === "submitted" && draft.submission?.countsHash !== draft.countsHash;
  const closed = draft.state !== "draft" || draft.expired;
  return <article id={`segment-draft-${draft.id}`} aria-label={`Segment draft ${draft.current.name}`} className="mt-4 rounded-[12px] p-3.5" style={box}>
    <div className="flex flex-wrap justify-between gap-2 text-[12px]"><strong>{draft.current.name} · version {draft.current.version}</strong><span>{draft.state} {draft.expired ? "· expired" : ""} · expires {new Date(draft.expiresAt).toLocaleString()}</span></div>
    <div className="mt-3 rounded-[10px] p-3 text-[12px]" style={{ background: "var(--app-surface-2)" }}>
      <p>Saved-rule matches now: <strong>{draft.counts.matched}</strong> · observed {new Date(draft.counts.observedAt).toLocaleString()}</p>
      <p className="mt-1">Inactive: {draft.counts.inactive} · Opted out: {draft.counts.optedOut} · Missing marketing consent: {draft.counts.noConsent}</p>
      <p className="mt-1">Active with consent flags passing: {draft.counts.flagsPass} · not authorized to send</p>
      <p className="mt-1 text-[11px]">Exclusions are disjoint in that order. Sending still requires channel consent, contact validity, suppression, frequency/quiet-hours and provider checks through the canonical sender.</p>
      {changed && <p className="mt-2 font-semibold">Unsaved edits are not reflected in these counts. Save a revision to recalculate.</p>}
    </div>
    {draft.rejectionReason && <p className="mt-3 text-[12px]">Rejected: {draft.rejectionReason}</p>}
    {draft.state === "applied" && <div className="mt-3 text-[12px]" role="status">
      <p className="font-bold">Canonical Segment verification: {draft.verification}</p>
      {draft.canonicalSegment ? <p>{draft.canonicalSegment.name} · version {draft.canonicalSegment.version} · <Link className="underline" href={`/customers/segments#canonical-segment-${draft.canonicalSegment.id}`}>Open saved Segment</Link></p> : <p>The applied Segment was deleted. It will not be silently recreated.</p>}
      {draft.verification === "changed" && <p>The canonical definition changed after approval. Audience use is blocked until a fresh review is approved.</p>}
      <p className="mt-1">A fresh review reads the current canonical definition and counts. It updates this same Segment after approval, not a second copy.</p>
      {draft.canonicalSegment && <div className="mt-2 flex flex-wrap items-end gap-2"><Input label="Fresh canonical review reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /><Button variant="outline" disabled={!reason.trim() || pending} onClick={() => reopen.mutate()}>Start fresh canonical review</Button></div>}
    </div>}
    {draft.state === "submitted" && <div className="mt-3 space-y-2 text-[12px]">
      <p className="font-bold">Pending exact approval · version {draft.submission?.version}</p>
      <p>Submitted {draft.submission ? new Date(draft.submission.at).toLocaleString() : "Not recorded"} · <Link className="underline" href="/dashboard/actions">Open Action Center</Link></p>
      <pre className="whitespace-pre-wrap break-words rounded border p-2" style={{ borderColor: "var(--app-border)" }}>{JSON.stringify(draft.current.rules, null, 2)}</pre>
      {audienceChanged && <p role="alert">Counts or consent exclusions changed since submission. Withdraw, refresh and resubmit to review the new audience context.</p>}
      <Button onClick={() => approve.mutate()} disabled={pending || draft.expired || audienceChanged}>Approve exact version and save Segment</Button>
      <Input label="Revision or rejection reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => withdraw.mutate()} disabled={!reason.trim() || pending}>Withdraw for changes</Button><Button variant="outline" onClick={() => reject.mutate()} disabled={!reason.trim() || pending}>Reject draft</Button></div>
    </div>}
    {!closed && <fieldset disabled={pending} className="mt-3 space-y-3">
      <Input label="Draft segment name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      <SegmentRuleBuilder rules={rules} onChange={setRules} allowedFields={fields} />
      <p className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>Only recorded visits, visit/signup dates and consent flags are supported here. No identity, sensitive-trait, tag or financial targeting.</p>
      <Input label="Revision or rejection reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save.mutate()} disabled={!changed || !reason.trim() || !name.trim() || pending}>Save draft revision</Button>
        <Button onClick={() => submit.mutate()} disabled={changed || pending}>Submit exact version for approval</Button>
        <Button variant="outline" onClick={() => reject.mutate()} disabled={!reason.trim() || pending}>Reject draft</Button>
        {draft.target && <Button variant="outline" onClick={() => reopen.mutate()} disabled={!reason.trim() || pending}>Refresh from current canonical Segment</Button>}
      </div>
    </fieldset>}
    <details className="mt-3 text-[11px]"><summary className="cursor-pointer font-bold">Agent approval and execution audit</summary>{!draft.actionHistoryComplete && <p className="mt-2">Older proposal revisions have no action audit yet. They are reconciled from the saved draft before the next change or approval.</p>}{draft.actionHistory.map((action) => <div key={action.id} className="mt-2 rounded border p-2" style={{ borderColor: "var(--app-border)" }}><p className="font-bold">Action v{action.expectedVersion ?? "unknown"} · {action.state} · attempts {action.executionAttemptCount}</p><p>Correlation ID: {action.correlationId}{action.canonicalOperationId ? ` · CRM Segment: ${action.canonicalOperationId}` : ""}</p>{action.rejectionReason && <p>Action rejection reason: {action.rejectionReason}</p>}{action.verifiedAt && <p>Verified {new Date(action.verifiedAt).toLocaleString()}</p>}<p className="mt-1">Recorded result: {JSON.stringify(action.actualResult)} · verification: {JSON.stringify(action.verificationResult)}</p>{action.events.map((event, index) => <p key={`${action.id}:${index}`} className="mt-1">{event.fromState ?? "created"} → {event.toState ?? "recorded"} · {event.eventType} · {new Date(event.createdAt).toLocaleString()}{event.reason ? ` · ${event.reason}` : ""}</p>)}</div>)}</details>
    <details className="mt-3 text-[11px]"><summary className="cursor-pointer font-bold">Immutable revision history and rule evidence</summary>{draft.versions.map((revision) => <div key={revision.version} className="mt-2 rounded border p-2" style={{ borderColor: "var(--app-border)" }}><p>Version {revision.version} · {new Date(revision.savedAt).toLocaleString()} · {revision.name}</p><p>Saved by {revision.actorUserId} · {revision.reason}</p><pre className="mt-1 whitespace-pre-wrap break-words">{JSON.stringify(revision.rules, null, 2)}</pre><p>Payload SHA-256: {revision.payloadHash}</p><p>Matches when saved: {revision.countsAtSave?.matched ?? "Not recorded"}</p></div>)}{draft.approvals?.map((approval) => <p key={`${approval.segmentId}:${approval.segmentVersion}`} className="mt-2">Approved proposal v{approval.version} → Segment v{approval.segmentVersion} · {new Date(approval.at).toLocaleString()} · by {approval.by}</p>)}</details>
  </article>;
}
