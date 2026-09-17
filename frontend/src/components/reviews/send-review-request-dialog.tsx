"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createReviewRequest, type MessageChannel } from "@/lib/reviews-api";
import { fetchQuotaUsage } from "@/lib/campaigns-api";
import { searchCustomers, type CustomerSearchResult } from "@/lib/customers-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const fieldLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "var(--app-text-disabled)", marginBottom: 5 };
const fieldInput: React.CSSProperties = { width: "100%", border: "1px solid var(--app-border)", borderRadius: 11, padding: 12, fontSize: 13.5, minHeight: 48, background: "var(--app-surface)", color: "var(--app-text)" };

/** Simple open/close controller so the header's "Send Request" button and any screen's own
 * empty-state CTA can all trigger the same dialog without lifting state through the whole tree. */
export function useSendReviewRequestDialog() {
  const [open, setOpen] = useState(false);
  return {
    open: () => setOpen(true),
    node: open ? <SendReviewRequestDialog onClose={() => setOpen(false)} /> : null,
  };
}

export function SendReviewRequestDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<MessageChannel>("email");

  const { data: results = [] } = useQuery({
    queryKey: ["customer-search", query],
    queryFn: () => searchCustomers(query),
    enabled: query.trim().length > 1 && !selected,
  });
  const { data: quota } = useQuery({ queryKey: ["quota-usage"], queryFn: fetchQuotaUsage });

  const mutation = useMutation({
    mutationFn: () => createReviewRequest({ customerId: selected?.id, phone: selected ? undefined : phone.trim() || undefined, channel }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-requests"] });
      queryClient.invalidateQueries({ queryKey: ["quota-usage"] });
      toast.success(`Review request sent by ${channel} — same link every customer gets.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this request — please try again."),
  });

  const canSend = !!selected || phone.trim().length > 3;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div className="w-[490px] max-w-full max-h-[88vh] overflow-y-auto rounded-[18px]" style={{ background: "var(--app-surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Send Review Request</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>

        <div className="flex flex-col gap-3 p-[17px]">
          <div>
            <label style={fieldLabel}>Find customer</label>
            <input
              value={selected ? selected.name : query}
              onChange={(e) => {
                setSelected(null);
                setQuery(e.target.value);
              }}
              placeholder="Search by name or phone…"
              style={fieldInput}
              autoFocus
            />
            {!selected && results.length > 0 && (
              <div className="mt-[9px] overflow-hidden rounded-[11px]" style={{ border: "1px solid var(--app-border)" }}>
                {results.map((c, i) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => {
                      setSelected(c);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-[10px] p-[11px_12px] text-left"
                    style={{ borderTop: i === 0 ? undefined : "1px solid var(--app-surface-2)" }}
                  >
                    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: "var(--app-sidebar-bg)" }}>
                      {c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{c.name}</span>
                      <span className="block text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{c.phone}</span>
                    </span>
                    <span className="text-[11px] font-bold" style={{ color: "var(--app-success-text)" }}>Select</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!selected && (
            <>
              <div className="flex items-center gap-[10px]">
                <span className="h-px flex-1" style={{ background: "var(--app-surface-2)" }} />
                <span className="text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>OR</span>
                <span className="h-px flex-1" style={{ background: "var(--app-surface-2)" }} />
              </div>
              <div>
                <label style={fieldLabel}>Enter a phone number</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XX XXXXXXX" style={fieldInput} />
                <p className="mt-[5px] text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Must match an existing customer record — this won&apos;t create a new one.</p>
              </div>
            </>
          )}

          <div>
            <label style={fieldLabel}>Channel</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value as MessageChannel)} style={{ ...fieldInput, fontWeight: 700 }}>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>
          </div>

          <div className="rounded-[12px] p-[13px]" style={{ border: "1px solid var(--app-border)", fontSize: 12.5, lineHeight: 1.6, color: "var(--app-text-faint)" }}>
            Hi {"{customer_name}"}, how was your visit to {"{business_name}"}? Leave a review: {"{review_url}"}
          </div>
          <div className="rounded-[11px] p-[11px_13px] text-[11.5px]" style={{ background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)", color: "var(--app-success-text)" }}>
            This is the same link every customer receives.
          </div>
          {quota && quota.quota > 0 && (
            <p className="text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{quota.quota - quota.used} of {quota.quota} messages remaining this month</p>
          )}
        </div>

        <div className="flex justify-end gap-[10px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={outlineBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!canSend || mutation.isPending} style={primaryBtn}>
            {mutation.isPending ? "Sending…" : "Send Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
