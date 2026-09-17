"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { createCustomer, fetchCustomers } from "@/lib/customers-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--app-border)", borderRadius: 11, padding: 12, fontSize: 13.5, minHeight: 48 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "var(--app-text-faint)", marginBottom: 5 };
const cancelBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { flex: 1, border: 0, background: "var(--app-primary)", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff" };

export function AddCustomerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [opening, setOpening] = useState("");

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers, enabled: open });
  const knownTags = Array.from(new Set(customers.flatMap((c) => c.tags))).slice(0, 8);

  const mutation = useMutation({
    mutationFn: (goToProfile: boolean) =>
      createCustomer({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        tags: tags.length ? tags : undefined,
        openingBalance: opening ? Number(opening) : undefined,
      }).then((c) => ({ c, goToProfile })),
    onSuccess: ({ c, goToProfile }) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`${c.name} added.`);
      reset();
      onClose();
      if (goToProfile) router.push(`/customers/${c.id}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this customer."),
  });

  function reset() {
    setName("");
    setPhone("");
    setEmail("");
    setTags([]);
    setTagInput("");
    setOpening("");
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function addCustomTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  const valid = name.trim().length > 0 && phone.trim().length > 0;
  const openingAmount = Number(opening) || 0;

  return (
    <PosModalShell open={open} onClose={() => { reset(); onClose(); }} title="Add Customer">
      <div className="flex flex-col gap-[13px] p-[17px]">
        <div>
          <label style={labelStyle}>NAME <span style={{ color: "#B42318" }}>*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" aria-label="Name" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>PHONE <span style={{ color: "#B42318" }}>*</span></label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx xxxxxxx" aria-label="Phone" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>EMAIL</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" aria-label="Email" style={inputStyle} />
        </div>
        <div>
          <label style={{ ...labelStyle, marginBottom: 7 }}>TAGS</label>
          <div className="flex flex-wrap gap-[7px]">
            {knownTags.map((t) => {
              const active = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  className="inline-flex min-h-[38px] items-center rounded-full px-[13px] text-[11.5px] font-bold"
                  style={{ background: active ? "#E8F7EE" : "var(--app-surface-2)", color: active ? "#0E8442" : "var(--app-text-muted)" }}
                >
                  {t}
                </button>
              );
            })}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTag(); } }}
              onBlur={addCustomTag}
              placeholder="+ Add your own…"
              aria-label="Add a tag"
              className="min-h-[38px] min-w-[120px] rounded-full px-[13px] text-[11.5px] font-bold"
              style={{ border: "1px dashed #C6CFD8", color: "var(--app-primary)" }}
            />
          </div>
          {tags.filter((t) => !knownTags.includes(t)).length > 0 && (
            <div className="mt-[7px] flex flex-wrap gap-[7px]">
              {tags.filter((t) => !knownTags.includes(t)).map((t) => (
                <button key={t} type="button" onClick={() => toggleTag(t)} className="inline-flex min-h-[32px] items-center rounded-full px-3 text-[11px] font-bold" style={{ background: "#E8F7EE", color: "#0E8442" }}>
                  {t} ×
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>OPENING CREDIT BALANCE (OPTIONAL)</label>
          <input type="number" min={0} value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" aria-label="Opening credit balance" style={{ ...inputStyle, fontSize: 15, fontWeight: 700 }} />
          {openingAmount > 0 && (
            <div className="mt-[9px] rounded-[11px] p-[11px_13px] text-[12px]" style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", color: "#912018" }}>
              You are recording {formatCurrency(openingAmount, session.business.currency)} as already owed.
            </div>
          )}
        </div>
        <div className="flex gap-[9px] pt-[14px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={() => { reset(); onClose(); }} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate(true)} disabled={!valid || mutation.isPending} style={cancelBtn}>Save &amp; View</button>
          <button type="button" onClick={() => mutation.mutate(false)} disabled={!valid || mutation.isPending} style={primaryBtn}>
            {mutation.isPending ? "Saving…" : "Save Customer"}
          </button>
        </div>
      </div>
    </PosModalShell>
  );
}
