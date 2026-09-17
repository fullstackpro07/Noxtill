"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCustomerDuplicates, dismissCustomerDuplicate, type DuplicatePair } from "@/lib/customer-duplicates-api";
import { mergeCustomer } from "@/lib/customers-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "12px", fontSize: 13, fontWeight: 800, color: "#fff" };

export function CustomerDuplicatesPanel() {
  const queryClient = useQueryClient();
  const { data: pairs = [], isPending } = useQuery({ queryKey: ["customer-duplicates"], queryFn: fetchCustomerDuplicates });
  const [merging, setMerging] = useState<DuplicatePair | null>(null);

  const dismissMutation = useMutation({
    mutationFn: (pair: DuplicatePair) => dismissCustomerDuplicate(pair.a.id, pair.b.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-duplicates"] });
      toast.success("Marked as not a duplicate.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save that."),
  });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Possible Duplicates</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{pairs.length}</div>
        </div>
      </div>

      <div className="flex gap-[10px] rounded-[12px] p-[12px_14px]" style={{ background: "#EEF4FF", border: "1px solid #C7D7FE" }}>
        <span className="text-[12px] leading-relaxed" style={{ color: "#3538CD" }}>
          <strong>Nothing merges on its own.</strong> These pairs match on your business&apos;s configured merge rule (Customer Settings → Merge
          rules) — exact phone number or email address only. You choose which record is primary, and no order, booking or payment is ever
          deleted. &quot;Not a duplicate&quot; is saved for real and won&apos;t come back.
        </span>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {!isPending && pairs.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No duplicates to review</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Exact phone/email matches will show up here.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 780 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Record A</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Record B</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Match reason</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p) => (
                  <tr key={`${p.a.id}-${p.b.id}`} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="p-[12px_17px] text-[12.5px] font-extrabold" style={{ color: "var(--app-primary)" }}>{p.a.name}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{p.b.name}</td>
                    <td className="p-[12px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{p.reason}</td>
                    <td className="p-[12px_17px] text-end">
                      <span className="inline-flex gap-[7px]">
                        <button type="button" onClick={() => dismissMutation.mutate(p)} disabled={dismissMutation.isPending} style={outlineBtn}>Not a duplicate</button>
                        <button type="button" onClick={() => setMerging(p)} className="rounded-[9px] px-[13px] py-2 text-[11.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Review &amp; Merge</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {merging && (
        <MergeReviewDialog
          pair={merging}
          onClose={() => setMerging(null)}
          onMerged={() => { setMerging(null); queryClient.invalidateQueries({ queryKey: ["customers"] }); queryClient.invalidateQueries({ queryKey: ["customer-duplicates"] }); }}
        />
      )}
    </main>
  );
}

function MergeReviewDialog({ pair, onClose, onMerged }: { pair: DuplicatePair; onClose: () => void; onMerged: () => void }) {
  const [primaryId, setPrimaryId] = useState(pair.a.id);
  const primary = primaryId === pair.a.id ? pair.a : pair.b;
  const duplicate = primaryId === pair.a.id ? pair.b : pair.a;

  const mutation = useMutation({
    mutationFn: () => mergeCustomer(primary.id, duplicate.id),
    onSuccess: () => {
      toast.success(`Merged "${duplicate.name}" into ${primary.name}.`);
      onMerged();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't merge these customers."),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(10,27,42,.42)" }}>
      <div className="w-[460px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)" }}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Review &amp; Merge</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex flex-col gap-3 p-[17px]">
          <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>Choose which record stays. The other&apos;s orders, credit history, appointments and everything else move onto it, then it&apos;s deleted. This can&apos;t be undone.</p>
          {[pair.a, pair.b].map((c) => (
            <label key={c.id} className="flex items-center gap-3 rounded-[12px] p-3" style={{ border: `1.5px solid ${primaryId === c.id ? "var(--app-primary)" : "var(--app-border)"}` }}>
              <input type="radio" checked={primaryId === c.id} onChange={() => setPrimaryId(c.id)} style={{ accentColor: "var(--app-primary)" }} />
              <span>
                <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{c.name}{primaryId === c.id ? " (keep)" : ""}</span>
                <span className="block text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{c.phone}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-[10px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ ...primaryBtn, flex: 1 }}>{mutation.isPending ? "Merging…" : "Merge"}</button>
        </div>
      </div>
    </div>
  );
}
