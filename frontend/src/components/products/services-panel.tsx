"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { fetchProducts, updateProduct } from "@/lib/products-api";
import { fetchCategories } from "@/lib/categories-api";
import { fetchStaffList } from "@/lib/staff-api";
import { fetchAppointments } from "@/lib/bookings-api";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import type { Product } from "@/lib/products";
import { ServiceFormDrawer } from "./service-form-drawer";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { generateExport } from "@/lib/exports-api";

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function ServicesPanel() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState("all");
  const [staffId, setStaffId] = useState("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [bulkDurOpen, setBulkDurOpen] = useState(false);
  const [bulkDuration, setBulkDuration] = useState("");

  const { data: services } = useQuery({ queryKey: ["products", "services"], queryFn: () => fetchProducts({ kind: "service" }) });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, staleTime: 5 * 60_000 });
  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: () => fetchStaffList(), staleTime: 5 * 60_000 });
  const { data: appointments } = useQuery({ queryKey: ["appointments", "last-90-days"], queryFn: () => fetchAppointments({ from: new Date(Date.now() - NINETY_DAYS_MS).toISOString() }) });

  const staffNameById = useMemo(() => new Map((staff ?? []).map((s) => [s.id, s.name])), [staff]);
  const bookingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const appt of appointments ?? []) counts.set(appt.serviceName, (counts.get(appt.serviceName) ?? 0) + 1);
    return counts;
  }, [appointments]);

  const filtered = useMemo(() => {
    return (services ?? []).filter((s) => {
      if (categoryId !== "all" && s.categoryId !== categoryId) return false;
      if (staffId !== "all" && !(s.eligibleStaffIds ?? []).includes(staffId)) return false;
      return true;
    });
  }, [services, categoryId, staffId]);

  const stats = useMemo(() => {
    const all = services ?? [];
    const total = all.length;
    const avgDur = total > 0 ? Math.round(all.reduce((s, p) => s + (p.durationMinutes ?? 30), 0) / total) : 0;
    const avgPrice = total > 0 ? all.reduce((s, p) => s + p.price, 0) / total : 0;
    let top: string | null = null;
    let topCount = 0;
    for (const p of all) {
      const c = bookingCounts.get(p.name) ?? 0;
      if (c > topCount) {
        topCount = c;
        top = p.name;
      }
    }
    return { total, avgDur, avgPrice, top };
  }, [services, bookingCounts]);

  const maxCount = Math.max(...Array.from(bookingCounts.values()), 1);

  const bulkDurationMutation = useMutation({
    mutationFn: async () => {
      const mins = Number(bulkDuration);
      const results = await Promise.allSettled(
        filtered.map((s) =>
          updateProduct(s.id, {
            name: s.name,
            category: s.category,
            categoryId: s.categoryId,
            kind: "service",
            price: s.price,
            costPrice: s.costPrice,
            durationMinutes: mins,
            variations: s.variations,
            eligibleStaffIds: s.eligibleStaffIds,
            bufferBeforeMin: s.bufferBeforeMin,
            bufferAfterMin: s.bufferAfterMin,
            depositRequired: s.depositRequired,
            depositAmount: s.depositAmount,
            active: s.active,
          }),
        ),
      );
      return results.filter((r) => r.status === "fulfilled").length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Updated duration on ${count} service(s).`);
      setBulkDurOpen(false);
      setBulkDuration("");
    },
    onError: () => toast.error("Couldn't update these services — please try again."),
  });

  const exportMutation = useMutation({
    mutationFn: () => generateExport("products", "xlsx"),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate this export."),
  });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Services</h2>
        <div className="ms-auto flex flex-wrap gap-2.5">
          <button type="button" onClick={() => setBulkDurOpen(true)} style={outlineBtn}>Bulk Duration Change</button>
          <button type="button" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending} style={outlineBtn}>Export</button>
          <button type="button" onClick={() => setCreating(true)} style={primaryBtn}>+ Add Service</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Total Services</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{stats.total}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Average Duration</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{stats.avgDur} min</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Most Booked</div>
          <div className="mt-[7px] text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>{stats.top ?? "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Average Price</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(stats.avgPrice, session.business.currency)}</div>
        </div>
      </div>

      {services && services.length > 0 && (
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Bookings per service (last 90 days)</h3>
          <div className="flex flex-col gap-2.5">
            {services.map((s) => {
              const count = bookingCounts.get(s.name) ?? 0;
              return (
                <div key={s.id}>
                  <div className="mb-1 flex justify-between"><span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{s.name}</span><span className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>{count} bookings</span></div>
                  <div className="h-2 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}><div className="h-full rounded-[6px]" style={{ width: `${(count / maxCount) * 100}%`, background: "var(--app-primary)" }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category" style={selectStyle}>
            <option value="all">All categories</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {staff && staff.length > 0 && (
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Staff" style={selectStyle}>
              <option value="all">All staff</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>

        {services && filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Add services so customers can book online</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Give each service a duration and the staff who can perform it.</div>
            <button type="button" onClick={() => setCreating(true)} className="mt-[15px] rounded-[11px] px-5 py-3 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Add Service</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 860 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Name</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Category</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Duration</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Price</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Staff who can perform it</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="p-[12px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{s.name}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{s.category || "—"}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{s.durationMinutes ?? 30} min</td>
                    <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(s.price, session.business.currency)}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{(s.eligibleStaffIds ?? []).length > 0 ? s.eligibleStaffIds!.map((id) => staffNameById.get(id) ?? "Unknown").join(", ") : "Any staff"}</td>
                    <td className="p-[12px_17px] text-end"><button type="button" onClick={() => setEditing(s)} style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 }}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ServiceFormDrawer open={creating} onClose={() => setCreating(false)} product={null} />
      <ServiceFormDrawer open={editing != null} onClose={() => setEditing(null)} product={editing} />

      <PosModalShell
        open={bulkDurOpen}
        onClose={() => setBulkDurOpen(false)}
        title="Bulk Duration Change"
        footer={
          <>
            <button type="button" onClick={() => setBulkDurOpen(false)} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => bulkDurationMutation.mutate()} disabled={!bulkDuration || filtered.length === 0 || bulkDurationMutation.isPending} style={{ ...primaryBtn, opacity: !bulkDuration || filtered.length === 0 ? 0.6 : 1 }}>
              {bulkDurationMutation.isPending ? "Updating…" : `Apply to ${filtered.length} service(s)`}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-2.5 p-[17px]">
          <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>Sets a new duration on every service matching the filters currently applied ({filtered.length}).</p>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>NEW DURATION (MINUTES)</span>
            <input type="number" min={5} step={5} value={bulkDuration} onChange={(e) => setBulkDuration(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)" }} />
          </label>
        </div>
      </PosModalShell>
    </main>
  );
}
