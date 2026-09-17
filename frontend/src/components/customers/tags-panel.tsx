"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCustomerTagsCatalog, createCustomerTagCatalogEntry } from "@/lib/customer-tags-catalog-api";
import { fetchSegments } from "@/lib/segments-api";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useCustomersSearchStore } from "@/store/customers-search-store";

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };

export function TagsPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useCustomersSearchStore((s) => s.query);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTag, setNewTag] = useState("");

  const { data: tags = [] } = useQuery({ queryKey: ["customer-tags-catalog"], queryFn: fetchCustomerTagsCatalog });
  const { data: segments = [] } = useQuery({ queryKey: ["segments"], queryFn: fetchSegments });

  const createMutation = useMutation({
    mutationFn: () => createCustomerTagCatalogEntry(newTag.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-tags-catalog"] });
      toast.success("Tag created.");
      setNewTag("");
      setCreateOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this tag."),
  });

  const segmentsUsingTag = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of segments) {
      for (const cond of s.rules.conditions) {
        if (cond.field === "tags") map.set(String(cond.value), (map.get(String(cond.value)) ?? 0) + 1);
      }
    }
    return map;
  }, [segments]);

  const filtered = useMemo(
    () => tags.filter((t) => !query || t.name.toLowerCase().includes(query.toLowerCase())),
    [tags, query],
  );

  const taggedCustomers = tags.reduce((s, t) => s + t.count, 0);
  const unusedTags = tags.filter((t) => t.count === 0).length;
  const segmentsUsingTags = new Set(segments.flatMap((s) => (s.rules.conditions.some((c) => c.field === "tags") ? [s.id] : []))).size;

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <span className="text-[13px] font-bold" style={{ color: "var(--app-text-muted)" }}>Tags group customers for segments, campaigns and pricing</span>
        <button type="button" onClick={() => setCreateOpen(true)} className="ml-auto" style={primaryBtn}>Create Tag</button>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Tags</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{tags.length}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Customers Tagged</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{taggedCustomers}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDE3B3" }}>
          <div className="text-[12px] font-bold" style={{ color: "#B54708" }}>Unused Tags</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{unusedTags}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Segments Using Tags</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{segmentsUsingTags}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No tags yet</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Create one above, or add one from a customer&apos;s profile.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 860 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Tag</th>
                  <th className="p-[10px] text-center text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customers</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Type</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Created</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Used in</th>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid var(--app-border-strong)", cursor: "pointer" }} onClick={() => router.push(`/customers?tag=${encodeURIComponent(t.name)}`)}>
                    <td className="p-[12px_17px]"><span className="rounded-full px-[11px] py-1 text-[12px] font-bold" style={{ background: "#EEF4FF", color: "#3538CD" }}>{t.name}</span></td>
                    <td className="p-[12px] text-center text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{t.count}</td>
                    <td className="p-[12px]"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: t.kind === "manual" ? "#EEF4FF" : "#F5EBFE", color: t.kind === "manual" ? "#3538CD" : "#7E22CE" }}>{t.kind === "manual" ? "Manual" : "Rule-based"}</span></td>
                    <td className="p-[12px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(t.createdAt)}</td>
                    <td className="p-[12px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{segmentsUsingTag.get(t.name) ? `${segmentsUsingTag.get(t.name)} segment(s)` : "—"}</td>
                    <td className="p-[12px_17px]"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: t.count > 0 ? "#E8F7EE" : "var(--app-surface-2)", color: t.count > 0 ? "#0E8442" : "var(--app-text-muted)" }}>{t.count > 0 ? "Active" : "Unused"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-[11px_17px] text-[11.5px]" style={{ borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text-disabled)" }}>
          Tags describe how a customer buys from you — never personal characteristics.
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(10,27,42,.42)" }}>
          <div className="w-[380px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)" }}>
            <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
              <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Create Tag</h3>
              <button type="button" onClick={() => setCreateOpen(false)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
            </div>
            <div className="p-[17px]">
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="e.g. Wholesale" aria-label="Tag name" className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} autoFocus />
            </div>
            <div className="flex justify-end gap-[10px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
              <button type="button" onClick={() => setCreateOpen(false)} style={outlineBtn}>Cancel</button>
              <button type="button" onClick={() => createMutation.mutate()} disabled={!newTag.trim() || createMutation.isPending} style={primaryBtn}>{createMutation.isPending ? "Creating…" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
