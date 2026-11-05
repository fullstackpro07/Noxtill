"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { askConfirm } from "@/lib/ask-dialog";
import {
  createCustomerAgentMessageDraft,
  createCustomerFollowUpTask,
  fetchCustomerChannelConsent,
  fetchCustomerAgentMessageDrafts,
  fetchCustomerFollowUpTasks,
  fetchCustomerProfileIntelligence,
  generateCustomerAgentMessageDraft,
  previewCustomerAgentMessageDraft,
  queueCustomerAgentMessageDraft,
  recordCustomerChannelConsent,
  updateCustomerAgentMessageDraft,
  type CustomerAgentMessageSendPreview,
  type CustomerChannelConsent,
  type CustomerMessageDraftPurpose,
} from "@/lib/customer-intelligence-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { fetchStaffList } from "@/lib/staff-api";
import { toast } from "@/lib/toast";

const box = { background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" };

export function CustomerProfileIntelligencePanel({ customerId }: { customerId: string }) {
  const [started, setStarted] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskReason, setTaskReason] = useState("");
  const [taskPriority, setTaskPriority] = useState<"urgent" | "normal" | "low">("normal");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [assigneeStaffId, setAssigneeStaffId] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftFollowUpTaskId, setDraftFollowUpTaskId] = useState("");
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [sendPreview, setSendPreview] = useState<{ draftId: string; preview: CustomerAgentMessageSendPreview } | null>(null);
  const [draftPurpose, setDraftPurpose] = useState<CustomerMessageDraftPurpose>("general_follow_up");
  const [consentChannel, setConsentChannel] = useState<CustomerChannelConsent["channel"] | "">("");
  const [consentState, setConsentState] = useState<"granted" | "revoked" | "">("");
  const [consentSource, setConsentSource] = useState<"customer_portal" | "website_form" | "paper_form" | "recorded_call" | "in_person" | "other" | "">("");
  const [consentReference, setConsentReference] = useState("");
  const taskKey = useRef<string | null>(null);
  const draftKey = useRef<string | null>(null);
  const aiDraftKey = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["customer-profile-intelligence", customerId],
    queryFn: () => fetchCustomerProfileIntelligence(customerId),
    enabled: started,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: "always",
    refetchInterval: 30_000,
  });
  const taskQuery = useQuery({
    queryKey: ["customer-agent-follow-up-tasks", customerId],
    queryFn: () => fetchCustomerFollowUpTasks(customerId),
    enabled: started,
  });
  const draftQuery = useQuery({
    queryKey: ["customer-agent-message-drafts", customerId],
    queryFn: () => fetchCustomerAgentMessageDrafts(customerId),
    enabled: started,
  });
  const consentQuery = useQuery({
    queryKey: ["customer-channel-consent", customerId],
    queryFn: () => fetchCustomerChannelConsent(customerId),
    enabled: started,
    staleTime: 0,
  });
  const staffQuery = useQuery({
    queryKey: ["staff-list"],
    queryFn: () => fetchStaffList(),
    enabled: started,
  });
  const taskMutation = useMutation({
    mutationFn: () => {
      taskKey.current ??= globalThis.crypto.randomUUID();
      return createCustomerFollowUpTask(customerId, {
        title: taskTitle.trim() || "Follow up with customer",
        reason: taskReason.trim() || data?.followUp.reason || "Customer follow-up requested by staff.",
        priority: taskPriority,
        dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : null,
        assigneeStaffId: assigneeStaffId || null,
        idempotencyKey: taskKey.current,
      });
    },
    onSuccess: async () => {
      taskKey.current = null;
      setTaskTitle("");
      setTaskReason("");
      setTaskDueAt("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-agent-follow-up-tasks", customerId] }),
        queryClient.invalidateQueries({ queryKey: ["action-center"] }),
        queryClient.invalidateQueries({ queryKey: ["actions"] }),
      ]);
      toast.success("Customer follow-up task added to the Action Center.");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not create the follow-up task."),
  });
  const draftMutation = useMutation({
    mutationFn: () => {
      if (editingDraftId) {
        return updateCustomerAgentMessageDraft(customerId, editingDraftId, draftBody.trim());
      }
      draftKey.current ??= globalThis.crypto.randomUUID();
      return createCustomerAgentMessageDraft(customerId, {
        body: draftBody.trim(),
        idempotencyKey: draftKey.current,
        followUpTaskId: draftFollowUpTaskId || null,
      });
    },
    onSuccess: async () => {
      draftKey.current = null;
      const wasEditing = editingDraftId !== null;
      setEditingDraftId(null);
      setDraftBody("");
      setDraftFollowUpTaskId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-agent-message-drafts", customerId] }),
        queryClient.invalidateQueries({ queryKey: ["customer-agent-follow-up-tasks", customerId] }),
      ]);
      toast.success(wasEditing ? "Reviewed draft updated. Nothing was sent." : "Message draft saved for human review. Nothing was sent.");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not save the message draft."),
  });
  const aiDraftMutation = useMutation({
    mutationFn: () => {
      aiDraftKey.current ??= globalThis.crypto.randomUUID();
      return generateCustomerAgentMessageDraft(customerId, {
        purpose: draftPurpose,
        idempotencyKey: aiDraftKey.current,
        followUpTaskId: draftFollowUpTaskId || null,
      });
    },
    onSuccess: async () => {
      aiDraftKey.current = null;
      setDraftFollowUpTaskId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-agent-message-drafts", customerId] }),
        queryClient.invalidateQueries({ queryKey: ["customer-agent-follow-up-tasks", customerId] }),
      ]);
      toast.success("AI draft saved for human review. Nothing was queued or sent.");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not generate a message draft."),
  });
  const sendPreviewMutation = useMutation({
    mutationFn: (draftId: string) => previewCustomerAgentMessageDraft(customerId, draftId),
    onSuccess: (preview, draftId) => setSendPreview({ draftId, preview }),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not check current send eligibility."),
  });
  const consentMutation = useMutation({
    mutationFn: () => {
      if (!consentChannel || !consentState || !consentSource || !consentReference.trim()) {
        throw new Error("Choose a channel, decision, source and evidence ID.");
      }
      return recordCustomerChannelConsent(customerId, {
        channel: consentChannel,
        state: consentState,
        source: consentSource,
        evidenceReference: consentReference.trim(),
      });
    },
    onSuccess: async () => {
      setConsentChannel("");
      setConsentState("");
      setConsentSource("");
      setConsentReference("");
      setSendPreview(null);
      await queryClient.invalidateQueries({ queryKey: ["customer-channel-consent", customerId] });
      toast.success("Channel consent record saved and audited.");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Could not save the consent record."),
  });
  const queueMessageMutation = useMutation({
    mutationFn: (draftId: string) => queueCustomerAgentMessageDraft(customerId, draftId),
    onSuccess: async (result) => {
      setSendPreview(null);
      await queryClient.invalidateQueries({ queryKey: ["customer-agent-message-drafts", customerId] });
      if (result.messageStatus === "failed") {
        toast.error("The message failed. It was not delivered; create a new reviewed draft before trying again.");
      } else if (result.queued) {
        toast.success(`Message queued · ${result.messageStatus}. Provider delivery is not yet confirmed.`);
      } else {
        toast.success(`Existing message status · ${result.messageStatus}. No duplicate was queued.`);
      }
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "The message was not queued. Recheck consent and channel eligibility."),
  });
  const data = query.error ? undefined : query.data;
  return (
    <section aria-label="Customer intelligence review" className="rounded-[16px] p-[17px]" style={box}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[760px]">
          <h2 className="text-[15px] font-extrabold">Customer Intelligence · profile review</h2>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>Review authorized customer activity and a transparent human follow-up cue. The narrative is deterministic, source-based and partial; customer-level details are not sent to an AI provider.</p>
        </div>
        <button type="button" onClick={() => started ? void query.refetch() : setStarted(true)} disabled={query.isFetching} className="rounded-[10px] px-4 py-2.5 text-[12px] font-bold text-white disabled:opacity-60" style={{ background: "var(--app-primary)" }}>
          {query.isFetching ? "Reviewing profile…" : data ? "Refresh profile review" : "Review profile intelligence"}
        </button>
      </div>
      {query.error && <p role="alert" className="mt-3 text-[12px]" style={{ color: "var(--app-text-muted)" }}>{query.error instanceof ApiError ? query.error.message : "Could not load this customer review. Try again."}</p>}
      {!data && !query.error && !query.isFetching && <p className="mt-3 text-[12px]" style={{ color: "var(--app-text-muted)" }}>No live profile review is loaded. Source windows, coverage and permission restrictions will be shown when you review this profile.</p>}
      {data && <div className="mt-4 space-y-3 text-[12px]">
        <p style={{ color: "var(--app-text-muted)" }}>Partial coverage · observed {new Date(data.observedAt).toLocaleString()} · profile last updated {new Date(data.profile.updatedAt).toLocaleString()}</p>
        <article aria-label="Customer 360 summary" className="rounded-[10px] p-3" style={{ background: "var(--app-surface-2)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">Customer 360 summary · deterministic</h3>
            <span className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>No AI conclusion · source records below</span>
          </div>
          {data.narrative.text.split("\n\n").map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`} className="mt-2 leading-relaxed">{paragraph}</p>)}
        </article>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-[10px] p-3" style={box}>
            <h3 className="font-bold">Completed orders</h3>
            {data.orders.state === "available" ? <><p className="mt-2">Last {data.windows.days} days: <strong>{data.orders.currentCount}</strong></p><p>Previous {data.windows.days} days: <strong>{data.orders.previousCount}</strong></p><p className="mt-1 text-[11px]">Created-time windows · excludes quotations and incomplete/cancelled orders</p></> : <p className="mt-2">Not available · Orders is disabled</p>}
          </article>
          <article className="rounded-[10px] p-3" style={box}>
            <h3 className="font-bold">RFM source values · no score</h3>
            {data.rfm.recency.state === "available" ? <p className="mt-2">Recency: {data.rfm.recency.daysSinceLatestCompletedOrder === null ? "No completed order recorded" : `${data.rfm.recency.daysSinceLatestCompletedOrder} days since last completed order`}</p> : <p className="mt-2">Recency: Not available · Orders is disabled</p>}
            {data.rfm.frequency.state === "available" ? <p>Frequency: {data.rfm.frequency.completedNonQuotationOrderCount} completed orders recorded</p> : <p>Frequency: Not available · Orders is disabled</p>}
            <p>Monetary: {data.rfm.monetary.state === "restricted" ? "Restricted" : data.rfm.monetary.recordedLifetimeSpend !== null && data.rfm.monetary.currency ? formatCurrency(data.rfm.monetary.recordedLifetimeSpend, data.rfm.monetary.currency) : "Not recorded"}</p>
            <p className="mt-1 text-[11px]">{data.rfm.score.message} CRM lifetime spend is not recomputed from orders or netted for refunds.</p>
          </article>
          <article className="rounded-[10px] p-3" style={box}>
            <h3 className="font-bold">Bookings · last 90 days</h3>
            {data.bookings.statuses ? <><p className="mt-2">Completed: {data.bookings.statuses.completed ?? 0} · No-show: {data.bookings.statuses.no_show ?? 0}</p><p>Cancelled: {data.bookings.statuses.cancelled ?? 0}</p><p className="mt-1 text-[11px]">Next booked/confirmed: {data.bookings.next ? new Date(data.bookings.next.startsAt).toLocaleString() : "None recorded"}</p></> : <p className="mt-2">Not available · Bookings is disabled</p>}
          </article>
          <article className="rounded-[10px] p-3" style={box}>
            <h3 className="font-bold">Message records · last 90 days</h3>
            {data.messages.statuses ? <><p className="mt-2">Delivered/read: {(data.messages.statuses.delivered ?? 0) + (data.messages.statuses.read ?? 0)}</p><p>Queued: {data.messages.statuses.queued ?? 0} · Sent: {data.messages.statuses.sent ?? 0}</p><p>Failed: {data.messages.statuses.failed ?? 0}</p><p className="mt-1 text-[11px]">Queued and sent do not prove delivery</p></> : <p className="mt-2">Not available · Unified Inbox is disabled</p>}
          </article>
          <article className="rounded-[10px] p-3" style={box}>
            <h3 className="font-bold">Recorded loyalty state</h3>
            <p className="mt-2">Enrollments: {data.loyalty.recordedEnrollments} · Stamps: {data.loyalty.recordedStamps}</p>
            <p>Active memberships: {data.loyalty.membershipStatuses.active ?? 0}</p>
            <Link href="/customers/loyalty" className="mt-2 inline-block underline" style={{ color: "var(--app-primary)" }}>Review loyalty and entitlements</Link>
          </article>
          <article className="rounded-[10px] p-3" style={box}>
            <h3 className="font-bold">Customer-linked feedback · last 90 days</h3>
            {data.feedback.state === "available" ? <><p className="mt-2">Private feedback records: {data.feedback.count}</p><p>Average: {data.feedback.averageStars === null ? "Not rated" : `${data.feedback.averageStars.toFixed(1)} / 5 stars`}</p><p className="mt-1 text-[11px]">Metadata only · feedback text is not included. Public reviews are not linked to individual customers.</p></> : <p className="mt-2">{data.feedback.state === "module_disabled" ? "Not available · Reviews is disabled" : "Restricted for this role"}</p>}
          </article>
        </div>
        <article className="rounded-[10px] p-3" style={box}>
          <h3 className="font-bold">Channel-specific marketing consent</h3>
          <p className="mt-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>Record only a real customer choice. A grant needs the internal ID of the form, case or other evidence; do not enter an email address, phone number or evidence text. A channel grant updates the CRM marketing flag while at least one channel remains granted, but CRM opt-out still blocks all sends.</p>
          {consentQuery.error ? <p role="alert" className="mt-2 text-[11px]" style={{ color: "var(--app-danger-strong)" }}>{consentQuery.error instanceof ApiError ? consentQuery.error.message : "Could not load channel consent records."}</p> : <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {(consentQuery.data?.channels ?? []).map((consent) => <div key={consent.channel} className="rounded-[8px] p-2.5" style={{ background: "var(--app-surface-2)" }}>
              <strong className="capitalize">{consent.channel}</strong>
              <p className="m-0 mt-1">{consent.state === "unknown" ? "Unknown · no channel decision recorded" : consent.state === "granted" ? "Granted" : "Revoked"}</p>
              {consent.updatedAt && <p className="m-0 mt-1 text-[10px]" style={{ color: "var(--app-text-muted)" }}>{consent.source?.replaceAll("_", " ")} · {consent.evidenceReference} · {formatDate(consent.updatedAt)}</p>}
            </div>)}
          </div>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select aria-label="Consent channel" value={consentChannel} onChange={(event) => setConsentChannel(event.target.value as CustomerChannelConsent["channel"] | "")} className="rounded-[8px] px-2 py-2 text-[12px]" style={box}>
              <option value="">Choose channel</option><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option>
            </select>
            <select aria-label="Consent decision" value={consentState} onChange={(event) => setConsentState(event.target.value as "granted" | "revoked" | "")} className="rounded-[8px] px-2 py-2 text-[12px]" style={box}>
              <option value="">Choose decision</option><option value="granted">Customer granted</option><option value="revoked">Customer revoked</option>
            </select>
            <select aria-label="Consent evidence source" value={consentSource} onChange={(event) => setConsentSource(event.target.value as typeof consentSource)} className="rounded-[8px] px-2 py-2 text-[12px]" style={box}>
              <option value="">Choose source</option><option value="customer_portal">Customer portal</option><option value="website_form">Website form</option><option value="paper_form">Paper form</option><option value="recorded_call">Recorded call</option><option value="in_person">In person</option><option value="other">Other documented source</option>
            </select>
            <input aria-label="Internal consent evidence ID" value={consentReference} onChange={(event) => setConsentReference(event.target.value)} maxLength={100} placeholder="Evidence ID only" className="rounded-[8px] px-2.5 py-2 text-[12px]" style={box} />
          </div>
          <button type="button" onClick={async () => {
            if (!consentChannel || !consentState || !consentSource || !consentReference.trim()) {
              toast.error("Choose a channel, decision, source and internal evidence ID.");
              return;
            }
            if (consentState === "granted") {
              const confirmed = await askConfirm({
                title: "Record granted channel consent?",
                description: "Confirm that the customer explicitly agreed to marketing on this channel and that the evidence ID identifies the real record. Do not grant consent based only on the general CRM consent flag.",
                confirmLabel: "Record customer consent",
              });
              if (!confirmed) return;
            }
            consentMutation.mutate();
          }} disabled={consentMutation.isPending} className="mt-2 rounded-[8px] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
            {consentMutation.isPending ? "Saving consent record…" : "Record customer choice"}
          </button>
          {consentQuery.data?.history.length ? <details className="mt-3">
            <summary className="cursor-pointer font-semibold">Recent consent history</summary>
            <div className="mt-2 space-y-1">{consentQuery.data.history.map((record) => <p key={record.id} className="m-0">{record.channel} · {record.state} · {record.source.replaceAll("_", " ")} · {record.evidenceReference} · revision {record.revision} · {formatDate(record.createdAt)}</p>)}</div>
          </details> : null}
        </article>
        <article className="rounded-[10px] p-3" style={{ background: "var(--app-surface-2)" }}>
          <h3 className="font-bold">Human follow-up cue · {data.followUp.state.replaceAll("_", " ")}</h3>
          <p className="mt-1">{data.followUp.reason}</p>
          <p className="mt-1 text-[11px]">Confidence is not calibrated · Minimum previous-window history: {data.windows.minimumPreviousOrders} completed orders · Drop threshold: at least {data.windows.minimumOrderDecline} fewer completed order{data.windows.minimumOrderDecline === 1 ? "" : "s"}. No contact is claimed until a person records it.</p>
          {data.followUp.state === "support_review" && <Link href={data.followUp.href} className="mt-2 inline-block underline" style={{ color: "var(--app-primary)" }}>Open call history to review saved support follow-ups</Link>}
        </article>
        <div className="grid gap-3 lg:grid-cols-2">
          <article className="rounded-[10px] p-3" style={box}>
            <h3 className="font-bold">Create a human follow-up task</h3>
            <p className="mt-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>Saved to the existing Customer task queue and Action Center. It does not mark a contact as completed.</p>
            <div className="mt-3 grid gap-2">
              <input aria-label="Follow-up task title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Follow up with customer" maxLength={191} className="rounded-[8px] px-2.5 py-2 text-[12px]" style={box} />
              <textarea aria-label="Follow-up reason" value={taskReason} onChange={(event) => setTaskReason(event.target.value)} placeholder={data.followUp.reason} maxLength={2000} rows={2} className="rounded-[8px] px-2.5 py-2 text-[12px]" style={box} />
              <div className="grid gap-2 sm:grid-cols-3">
                <select aria-label="Task priority" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as "urgent" | "normal" | "low")} className="rounded-[8px] px-2 py-2 text-[12px]" style={box}>
                  <option value="urgent">Urgent</option><option value="normal">Normal</option><option value="low">Low</option>
                </select>
                <input aria-label="Task due date" type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} className="rounded-[8px] px-2 py-2 text-[12px]" style={box} />
                <select aria-label="Assign task to staff" value={assigneeStaffId} onChange={(event) => setAssigneeStaffId(event.target.value)} className="rounded-[8px] px-2 py-2 text-[12px]" style={box}>
                  <option value="">Unassigned</option>
                  {(staffQuery.data ?? []).filter((staff) => staff.active).map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
                </select>
              </div>
              <button type="button" onClick={() => taskMutation.mutate()} disabled={taskMutation.isPending || !taskTitle.trim() && !data.followUp.reason.trim()} className="justify-self-start rounded-[8px] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
                {taskMutation.isPending ? "Saving task…" : "Create follow-up task"}
              </button>
            </div>
            {taskQuery.error && <p role="alert" className="mt-2 text-[11px]" style={{ color: "var(--app-danger-strong)" }}>{taskQuery.error instanceof ApiError ? taskQuery.error.message : "Could not load follow-up tasks."}</p>}
            <div className="mt-3 space-y-2">
              {(taskQuery.data ?? []).map((task) => <div key={task.id} className="rounded-[8px] p-2.5 text-[11px]" style={{ background: "var(--app-surface-2)" }}><strong>{task.title}</strong> · {task.priority} · {task.status}{task.dueAt ? ` · Due ${formatDate(task.dueAt)}` : " · No due date"}<p className="m-0 mt-1">{task.reason}</p>
                {task.linkedMessages.length > 0 && <div className="mt-2 space-y-1"><strong>Linked message activity</strong>{task.linkedMessages.map((message) => <p key={message.messageDraftId} className="m-0">{message.draftStatus === "draft" ? "Draft only · not sent" : message.providerDeliveryConfirmed ? `Provider confirmed ${message.messageStatus}` : message.messageStatus === "failed" ? "Provider reported delivery failure" : `Awaiting provider confirmation · ${message.messageStatus ?? "queued"}`}</p>)}</div>}
              </div>)}
              {!taskQuery.isPending && !taskQuery.error && !(taskQuery.data?.length) && <p className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>No follow-up tasks recorded for this customer.</p>}
            </div>
          </article>
          <article className="rounded-[10px] p-3" style={box}>
            <h3 className="font-bold">Prepare a customer message draft</h3>
            <p className="mt-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>You can write a draft yourself or generate a generic AI draft from a selected purpose. The AI receives no customer name, contact details, orders, notes or history. A person must review, preview and explicitly queue a message through Noxtill Messaging; the agent never sends automatically. A current, evidenced grant for the resolved channel is required below.</p>
            {data.marketing.exclusions.length > 0 || data.messages.state !== "available" ? <p className="mt-2 text-[11px]" role="status">Drafting is blocked until the customer is active, contactable, opted in and Unified Inbox is enabled. A queue attempt also rechecks the current channel-specific consent record, opt-out, channel availability, timing and message limits.</p> : <>
              <label className="mt-3 block text-[11px] font-semibold">AI draft purpose
                <select aria-label="AI draft purpose" value={draftPurpose} onChange={(event) => setDraftPurpose(event.target.value as CustomerMessageDraftPurpose)} className="mt-1 block w-full rounded-[8px] px-2.5 py-2 text-[12px]" style={box}>
                  <option value="general_follow_up">General follow-up</option><option value="booking_follow_up">Booking follow-up</option><option value="order_follow_up">Order follow-up</option><option value="support_follow_up">Support follow-up</option><option value="winback_follow_up">Win-back · {data.windows.lapsedDays}-day rule</option><option value="feedback_request">Feedback request</option>
                </select>
              </label>
              <label className="mt-2 block text-[11px] font-semibold">Link to an open follow-up task
                <select aria-label="Link message draft to follow-up task" value={draftFollowUpTaskId} onChange={(event) => setDraftFollowUpTaskId(event.target.value)} disabled={editingDraftId !== null} className="mt-1 block w-full rounded-[8px] px-2.5 py-2 text-[12px] disabled:opacity-60" style={box}>
                  <option value="">No linked task</option>
                  {editingDraftId && draftFollowUpTaskId && !(taskQuery.data ?? []).some((task) => task.id === draftFollowUpTaskId && task.status === "open") && <option value={draftFollowUpTaskId}>Existing linked task</option>}
                  {(taskQuery.data ?? []).filter((task) => task.status === "open").map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                </select>
              </label>
              <p className="mt-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>The task view will show this draft and any provider-reported delivery status. Draft, queued and sent states do not prove delivery.</p>
              {draftPurpose === "winback_follow_up" && <p className="mt-2 text-[11px]" role="note">Available only when the canonical profile records at least {data.windows.lapsedDays} days without a visit. This creates a review-only draft, not a Marketing campaign; nothing is sent.</p>}
              <button type="button" onClick={() => aiDraftMutation.mutate()} disabled={aiDraftMutation.isPending} className="mt-2 rounded-[8px] px-3 py-2 text-[12px] font-bold disabled:opacity-50" style={{ background: "var(--app-surface-2)", color: "var(--app-text)" }}>{aiDraftMutation.isPending ? "Generating draft…" : "Generate AI draft for review"}</button>
              <textarea aria-label="Customer message draft" value={draftBody} onChange={(event) => setDraftBody(event.target.value)} placeholder="Write or edit a message for a person to review…" maxLength={2000} rows={4} className="mt-3 w-full rounded-[8px] px-2.5 py-2 text-[12px]" style={box} />
              <button type="button" onClick={() => draftMutation.mutate()} disabled={draftMutation.isPending || !draftBody.trim()} className="mt-2 rounded-[8px] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>{draftMutation.isPending ? "Saving draft…" : editingDraftId ? "Save reviewed draft" : "Save my draft for review"}</button>
              {editingDraftId && <button type="button" onClick={() => { setEditingDraftId(null); setDraftBody(""); setDraftFollowUpTaskId(""); }} className="ml-2 rounded-[8px] px-3 py-2 text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Cancel edit</button>}
            </>}
            {aiDraftMutation.error && <p role="alert" className="mt-2 text-[11px]" style={{ color: "var(--app-danger-strong)" }}>{aiDraftMutation.error instanceof ApiError ? aiDraftMutation.error.message : "AI draft generation is unavailable. You can still write a draft manually."}</p>}
            {draftQuery.error && <p role="alert" className="mt-2 text-[11px]" style={{ color: "var(--app-danger-strong)" }}>{draftQuery.error instanceof ApiError ? draftQuery.error.message : "Could not load message drafts."}</p>}
            <div className="mt-3 space-y-2">
              {(draftQuery.data ?? []).map((draft) => <div key={draft.id} className="rounded-[8px] p-2.5 text-[11px]" style={{ background: "var(--app-surface-2)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{draft.generatedByAgent ? "AI-generated" : "Staff-written"} · {formatDate(draft.createdAt)}</strong>
                  {draft.status === "draft" && <button type="button" onClick={() => { setEditingDraftId(draft.id); setDraftBody(draft.body); setDraftFollowUpTaskId(draft.followUpTaskId ?? ""); }} className="rounded-[7px] px-2 py-1 font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text)" }}>{editingDraftId === draft.id ? "Editing" : "Edit draft"}</button>}
                </div>
                <p className="m-0 mt-1 whitespace-pre-wrap">{draft.body}</p>
                {draft.followUpTaskId && <p className="m-0 mt-1">Linked task: {(taskQuery.data ?? []).find((task) => task.id === draft.followUpTaskId)?.title ?? "Existing task"}</p>}
                {draft.status === "queued" ? <p className="m-0 mt-1">Queued for provider processing · message status: {draft.messageStatus ?? "unknown"}. Queued or sent does not mean delivered.</p> : <p className="m-0 mt-1">Draft only · not queued or sent.</p>}
                {draft.status === "draft" && data.messages.state === "available" && data.marketing.exclusions.length === 0 && <button type="button" onClick={() => sendPreviewMutation.mutate(draft.id)} disabled={sendPreviewMutation.isPending || queueMessageMutation.isPending} className="mt-2 rounded-[7px] px-2.5 py-1.5 font-bold disabled:opacity-50" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>{sendPreviewMutation.isPending ? "Checking eligibility…" : "Preview send"}</button>}
                {sendPreview?.draftId === draft.id && <div className="mt-2 rounded-[8px] p-2.5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
                  <p className="m-0 font-semibold">Preview · {sendPreview.preview.channel} · {sendPreview.preview.category}</p>
                  <p className="mt-1 whitespace-pre-wrap">{sendPreview.preview.renderedText}</p>
                  <p className="mt-1" style={{ color: "var(--app-text-muted)" }}>{sendPreview.preview.scheduledFor ? `Scheduled for ${new Date(sendPreview.preview.scheduledFor).toLocaleString()}` : "Eligible to queue now"} · {sendPreview.preview.disclosure}</p>
                  <button type="button" disabled={queueMessageMutation.isPending} onClick={async () => {
                    const confirmed = await askConfirm({
                      title: "Queue this reviewed customer message?",
                      description: "This creates one message through Noxtill’s existing messaging queue. The current channel-specific consent record, CRM consent, opt-out, channel, quota and timing checks run again. Delivery is pending until the provider confirms it.",
                      confirmLabel: "Queue message",
                    });
                    if (confirmed) queueMessageMutation.mutate(draft.id);
                  }} className="mt-2 rounded-[7px] px-2.5 py-1.5 font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>{queueMessageMutation.isPending ? "Queueing…" : "Queue reviewed message"}</button>
                </div>}
              </div>)}
              {!draftQuery.isPending && !draftQuery.error && !(draftQuery.data?.length) && <p className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>No Customer Intelligence message drafts recorded.</p>}
            </div>
          </article>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-[10px] p-3" style={box}>
            <h3 className="font-bold">Marketing eligibility · {data.marketing.state === "excluded" ? "Excluded" : "Channel check required"}</h3>
            {data.marketing.exclusions.map((reason) => <p key={reason} className="mt-1">{reason}</p>)}
            <p className="mt-2 text-[11px]">{data.marketing.message}</p>
          </article>
          <article className="rounded-[10px] p-3" style={box}>
            <h3 className="font-bold">Profile context and privacy</h3>
            <p className="mt-1">Recorded visits: {data.profile.recordedVisits} · Last visit: {data.profile.lastVisitAt ? formatDate(data.profile.lastVisitAt) : "Not recorded"}</p>
            <p className="mt-1">Recorded lifetime spend: {data.financial.recordedLifetimeSpend !== null && data.financial.currency ? formatCurrency(data.financial.recordedLifetimeSpend, data.financial.currency) : "Restricted"}</p>
            <p className="mt-1">Business-memory notes: {data.notes.count ?? "Restricted"} · Content is not included</p>
            <p className="mt-1">Unresolved support tickets: {data.support.unresolvedCount ?? "Restricted"}</p>
            {data.support.state === "restricted" && <p className="mt-1 text-[11px]">Support metadata requires Voice access and an enabled Phone Receptionist module.</p>}
            <p className="mt-1 text-[11px]">Credit and payment details are not included. This summary is not persisted.</p>
          </article>
        </div>
        <details>
          <summary className="cursor-pointer font-bold">Evidence windows and limits</summary>
          <p className="mt-2">Current window: {new Date(data.windows.currentFrom).toLocaleString()} → {new Date(data.windows.to).toLocaleString()}</p>
          <p>Previous window: {new Date(data.windows.previousFrom).toLocaleString()} → {new Date(data.windows.currentFrom).toLocaleString()}</p>
          {data.sources.map((source) => <p key={source.source} className="mt-2"><strong>{source.source}</strong> · {source.fields.join(", ")} · {source.window}</p>)}
          {data.limits.map((limit) => <p key={limit} className="mt-2" style={{ color: "var(--app-text-muted)" }}>{limit}</p>)}
        </details>
      </div>}
    </section>
  );
}
