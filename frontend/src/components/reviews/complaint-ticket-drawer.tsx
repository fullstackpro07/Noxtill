"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { updateFeedback, replyToFeedback, type LivePrivateFeedback, type FeedbackStatus } from "@/lib/reviews-api";
import { fetchCustomer } from "@/lib/customers-api";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

const STATUS_TONE: Record<FeedbackStatus, { bg: string; fg: string }> = {
  open: { bg: "#FEE4E2", fg: "var(--app-danger-strong)" },
  assigned: { bg: "#EEF4FF", fg: "#3538CD" },
  resolved: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
};

export function ComplaintTicketDrawer({ complaint, onClose }: { complaint: LivePrivateFeedback; onClose: () => void }) {
  const [reply, setReply] = useState("");
  const [resolutionNote, setResolutionNote] = useState(complaint.resolutionNote ?? "");
  const session = useSession();
  const queryClient = useQueryClient();

  const { data: customer } = useQuery({
    queryKey: ["customer", complaint.customerId],
    queryFn: () => fetchCustomer(complaint.customerId!),
    enabled: !!complaint.customerId,
  });

  const canResolve = resolutionNote.trim().length >= 5;

  const replyMutation = useMutation({
    mutationFn: () => replyToFeedback(complaint.id, reply.trim()),
    onSuccess: () => {
      toast.success(`Reply sent to ${customer?.name ?? "the customer"}.`);
      setReply("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this reply — please try again."),
  });

  const resolveMutation = useMutation({
    mutationFn: () => updateFeedback(complaint.id, { status: "resolved", resolutionNote: resolutionNote.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      toast.success("Ticket resolved with note.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't resolve this — please try again."),
  });

  const assignMutation = useMutation({
    mutationFn: () => updateFeedback(complaint.id, { status: "assigned", assignedTo: session.user.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      toast.success(`Assigned to ${session.user.name}.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't assign this — please try again."),
  });

  const tone = STATUS_TONE[complaint.status];
  const ageDays = Math.floor((new Date().getTime() - new Date(complaint.createdAt).getTime()) / 86_400_000);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[85]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0" style={{ background: "rgba(10,27,42,.36)" }} />
      <aside role="dialog" aria-modal="true" className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col" style={{ background: "var(--app-surface)", boxShadow: "-18px 0 46px rgba(10,27,42,.18)" }}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Private Feedback Ticket</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-[17px]">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-[11px]">
              <span className="flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: "var(--app-sidebar-bg)" }}>
                {(complaint.customerId ? (customer?.name ?? "…") : "Anonymous").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>{complaint.customerId ? (customer?.name ?? "…") : "Anonymous"}</span>
                <span className="block text-[11.5px]" style={{ color: "var(--app-text-disabled)", marginTop: 2 }}>{formatDate(complaint.createdAt)} · {ageDays <= 0 ? "today" : `${ageDays}d`} old</span>
              </span>
              <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{complaint.status}</span>
            </div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <svg key={n} width={17} height={17} viewBox="0 0 24 24" fill={n <= complaint.stars ? "#F59E0B" : "#E1E7EE"} stroke={n <= complaint.stars ? "#F59E0B" : "#E1E7EE"}>
                  <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8Z" />
                </svg>
              ))}
            </div>
            <div className="rounded-[13px] p-[14px]" style={{ background: "#FEF3F2", border: "1px solid #FDD9D6" }}>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "#912018" }}>Private feedback — never posted publicly</div>
              <p className="m-0 mt-[7px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{complaint.message ?? "(no message left)"}</p>
            </div>

            {complaint.customerId && customer && (
              <Link href={`/customers/${customer.id}`} className="rounded-[12px] p-3.5" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface-2)" }}>
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Customer</span>
                <span className="text-[13px] font-bold" style={{ color: "var(--app-primary)" }}>{customer.name}</span>
                <span className="mt-1 block text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{customer.visitCount} visits</span>
              </Link>
            )}

            {complaint.status !== "resolved" && (
              <div className="flex items-center justify-between rounded-[12px] px-3.5 py-2.5" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface-2)" }}>
                <p className="m-0 text-[12px]" style={{ color: "var(--app-text-faint)" }}>
                  {complaint.assignedTo ? <>Assigned to <strong style={{ color: "var(--app-text)" }}>{complaint.assignedTo}</strong></> : "Unassigned"}
                </p>
                {complaint.assignedTo !== session.user.name && (
                  <button type="button" onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending} className="text-[12px] font-bold" style={{ color: "var(--app-primary)" }}>
                    {assignMutation.isPending ? "Assigning…" : "Assign to me"}
                  </button>
                )}
              </div>
            )}

            {complaint.customerId ? (
              <div>
                <label className="mb-[5px] block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Private reply</label>
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Reply privately to this customer…" className="w-full rounded-[11px] p-[11px] text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
                <div className="mt-[9px] flex justify-end">
                  <button
                    type="button"
                    onClick={() => replyMutation.mutate()}
                    disabled={!reply.trim() || replyMutation.isPending}
                    className="rounded-[10px] px-[13px] py-2.5 text-[12px] font-bold"
                    style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-success-text)" }}
                  >
                    {replyMutation.isPending ? "Sending…" : "Send reply"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="m-0 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>This feedback was left anonymously — there&apos;s no customer to reply to.</p>
            )}

            <div className="pt-3.5" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
              <label className="mb-[5px] block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Resolution note — required to resolve</label>
              <textarea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} rows={2} placeholder="What was done to resolve this?" className="w-full rounded-[11px] p-[11px] text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
            </div>
          </div>
        </div>
        <div className="flex gap-[9px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-3" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" onClick={() => resolveMutation.mutate()} disabled={!canResolve || resolveMutation.isPending} className="flex-1 rounded-[11px] py-3 text-[13px] font-extrabold text-white" style={{ background: canResolve ? "var(--app-primary)" : "var(--app-text-disabled)" }}>
            {resolveMutation.isPending ? "Saving…" : "Resolve Ticket"}
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
