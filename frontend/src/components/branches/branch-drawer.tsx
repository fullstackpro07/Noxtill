"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Copy, Check } from "lucide-react";
import { fetchBranches, createBranch, updateBranch, type Branch } from "@/lib/branches-api";
import { fetchRollupDashboard, fetchRollupCompare } from "@/lib/branches-api";
import { fetchProducts } from "@/lib/products-api";
import { createStockTransfer } from "@/lib/stock-transfers-api";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/format";
import { useBranchWorkspace } from "@/components/branches/use-branch-workspace";
import { useBranchDrawer } from "@/components/branches/branch-drawer-context";
import { useBranchContextStore } from "@/store/branch-context-store";
import { BR } from "@/components/branches/branches-ui";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const label: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: BR.textFaint, marginBottom: 5 };
const inputStyle: React.CSSProperties = { width: "100%", border: `1px solid ${BR.border}`, borderRadius: 11, padding: 12, fontSize: 13.5, minHeight: 48 };
const selectStyle: React.CSSProperties = { width: "100%", border: `1px solid ${BR.border}`, borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: BR.textSubtle, background: "#fff", minHeight: 48 };

export function BranchDrawer() {
  const { drawer, close } = useBranchDrawer();
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  if (!drawer) return null;

  const branchId = drawer.mode !== "transfer" ? drawer.branchId : null;
  const existing = branchId ? branches.find((b) => b.id === branchId) ?? null : null;
  // Setup/Hours read real fields into local edit state on mount only — remounting via `key` when
  // the target branch changes (or branches finishes loading) avoids syncing state from a query in
  // an effect, which the lint rule (and React's own guidance) flags as cascading-render-prone.
  const bodyKey = `${drawer.mode}:${branchId ?? "new"}:${branches.length}`;

  return (
    <>
      <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.36)", zIndex: 80 }} />
      <aside role="dialog" aria-modal="true" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: drawer.mode === "drill" ? 560 : 500, maxWidth: "100%", background: "#fff", zIndex: 85, boxShadow: "-18px 0 46px rgba(10,27,42,.18)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 17, borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A", flex: 1 }}>
            {drawer.mode === "setup" ? (drawer.branchId ? "Edit Branch" : "Add Branch") : drawer.mode === "drill" ? "Branch Preview" : drawer.mode === "transfer" ? "New Stock Transfer" : "Operating Hours"}
          </h3>
          <button type="button" onClick={close} aria-label="Close" style={{ width: 34, height: 34, border: `1px solid ${BR.border}`, background: "#fff", borderRadius: 9, color: BR.textDim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 17 }} className="nx-scroll">
          {drawer.mode === "setup" && <SetupBody key={bodyKey} branchId={drawer.branchId} existing={existing} />}
          {drawer.mode === "drill" && <DrillBody branchId={drawer.branchId} />}
          {drawer.mode === "transfer" && <TransferBody />}
          {drawer.mode === "hours" && <HoursBody key={bodyKey} branchId={drawer.branchId} existing={existing} />}
        </div>
      </aside>
    </>
  );
}

function SetupBody({ branchId, existing }: { branchId: string | null; existing: Branch | null }) {
  const { close } = useBranchDrawer();
  const queryClient = useQueryClient();

  const [name, setName] = useState(existing?.name ?? "");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [country, setCountry] = useState(existing?.country ?? "");
  const [timezone, setTimezone] = useState(existing?.timezone ?? "Asia/Karachi");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isNew = !branchId;
  const valid = isNew ? name.trim() !== "" && ownerName.trim() !== "" && ownerEmail.trim() !== "" : name.trim() !== "";

  const mutation = useMutation({
    mutationFn: async () => {
      if (isNew) {
        return createBranch({ name: name.trim(), ownerName: ownerName.trim(), ownerEmail: ownerEmail.trim(), country: country.trim() || undefined, timezone });
      }
      await updateBranch(branchId!, { name: name.trim(), country: country.trim() || null, timezone });
      return null;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["rollup-dashboard"] });
      if (result?.tempPassword) {
        // The owner has no account yet — the backend generated a real login for them. Show it
        // now, since this is the only moment it's ever returned; discarding it here would leave
        // no way to actually hand the new owner a way to sign in.
        setTempPassword(result.tempPassword);
        return;
      }
      toast.success(isNew ? `"${name.trim()}" created.` : "Branch saved.");
      close();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this branch — please try again."),
  });

  async function copyPassword() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy — select and copy it manually.");
    }
  }

  if (tempPassword) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#0F172A" }}>Branch created</div>
        <div style={{ fontSize: 12.5, color: BR.textMuted, lineHeight: 1.55 }}>
          {ownerName.trim()} doesn&apos;t have an account yet — share this temporary password with them so they can sign in and set their own.
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${BR.borderStrong}`, background: "#F9FAFB", borderRadius: 10, padding: "10px 14px" }}>
          <code style={{ fontSize: 13.5 }}>{tempPassword}</code>
          <button type="button" onClick={copyPassword} aria-label="Copy password" style={{ border: 0, background: "transparent", color: BR.textMuted, cursor: "pointer", display: "flex" }}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        <button type="button" onClick={close} style={{ border: 0, background: BR.primary, borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      <div>
        <label style={label}>Branch name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gulberg Main" style={inputStyle} />
      </div>
      {isNew && (
        <>
          <div>
            <label style={label}>Owner name</label>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={label}>Owner email</label>
            <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} style={inputStyle} />
          </div>
        </>
      )}
      <div>
        <label style={label}>Country</label>
        <input value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={label}>Timezone</label>
        <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. Asia/Karachi" style={inputStyle} />
      </div>
      <div style={{ borderTop: "1px solid #F0F2F5", paddingTop: 13, fontSize: 11.5, color: BR.textFaint, lineHeight: 1.5 }}>
        Per-branch catalog overrides, a named manager and address aren&apos;t tracked yet in this build — a manager is whoever has the manager role on this branch&apos;s staff roster, set from Staff.
      </div>
      <div style={{ display: "flex", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14 }}>
        <button type="button" onClick={close} style={{ border: `1px solid ${BR.border}`, background: "#fff", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: BR.textSubtle, cursor: "pointer", minHeight: 46 }}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!valid || mutation.isPending}
          style={{ flex: 1, border: 0, background: BR.primary, borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46, opacity: !valid || mutation.isPending ? 0.6 : 1 }}
        >
          {mutation.isPending ? "Saving…" : isNew ? "Create Branch" : "Save Branch"}
        </button>
      </div>
    </div>
  );
}

function DrillBody({ branchId }: { branchId: string }) {
  const router = useRouter();
  const { close } = useBranchDrawer();
  const session = useSession();
  const currency = session.business.currency;
  const setSelectedBranchId = useBranchContextStore((s) => s.setSelectedBranchId);

  const { data: ws, isPending } = useBranchWorkspace(branchId);
  const { data: rollup } = useQuery({ queryKey: ["rollup-dashboard", 30], queryFn: () => fetchRollupDashboard(30) });
  const { data: compare } = useQuery({ queryKey: ["rollup-compare", 8], queryFn: () => fetchRollupCompare(8) });
  const row = rollup?.branches.find((b) => b.businessId === branchId);
  const weeks = compare?.find((c) => c.businessId === branchId)?.weeks ?? [];

  if (isPending || !ws) return <div style={{ fontSize: 12.5, color: BR.textFaint }}>Loading…</div>;

  const margin = row && row.revenue > 0 ? (row.grossProfit / row.revenue) * 100 : 0;
  const avgTicket = row && row.ordersCount > 0 ? row.revenue / row.ordersCount : 0;
  const maxWeek = Math.max(...weeks.map((w) => w.revenue), 1);
  const points = weeks.map((w, i) => ({ x: weeks.length > 1 ? (i / (weeks.length - 1)) * 560 : 0, y: 100 - (w.revenue / maxWeek) * 84 }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{ws.branch.name}</div>
        <div style={{ fontSize: 12, color: BR.textFaint, marginTop: 3 }}>
          {ws.branch.country ?? "—"} · {ws.branch.currency}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ border: "1.5px solid #BFE7CF", background: "#F7FCF9", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#0E8442" }}>Revenue</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginTop: 4 }}>{row ? formatCurrency(row.revenue, currency) : "—"}</div>
        </div>
        <div style={{ border: `1px solid ${BR.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: BR.textMuted }}>Profit</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#12A150", marginTop: 4 }}>{row ? formatCurrency(row.grossProfit, currency) : "—"}</div>
        </div>
        <div style={{ border: `1px solid ${BR.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: BR.textMuted }}>Margin</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginTop: 4 }}>{margin.toFixed(1)}%</div>
        </div>
        <div style={{ border: `1px solid ${BR.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: BR.textMuted }}>Average ticket</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginTop: 4 }}>{formatCurrency(avgTicket, currency)}</div>
        </div>
      </div>
      <div>
        {[
          ["Orders", row ? String(row.ordersCount) : "—"],
          ["Customers", String(ws.customers.count)],
          ["Rating", ws.reviews ? `${ws.reviews.averageRating.toFixed(1)} ★` : "—"],
          ["Credit outstanding", formatCurrency(ws.credit.totalOutstanding, currency)],
          ["Staff", String(ws.staff.length)],
        ].map(([l, v], i, arr) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i === arr.length - 1 ? "none" : "1px solid #F2F4F7" }}>
            <span style={{ fontSize: 12.5, color: BR.textMuted }}>{l}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: l === "Credit outstanding" ? "#B54708" : BR.textSubtle }}>{v}</span>
          </div>
        ))}
      </div>
      {weeks.length > 1 && (
        <div>
          <div style={label}>Revenue trend</div>
          <svg viewBox="0 0 560 110" style={{ width: "100%", height: 110, display: "block" }}>
            <path d={path} fill="none" stroke="#12A150" strokeWidth={2.4} strokeLinejoin="round" />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3.2} fill="#fff" stroke="#12A150" strokeWidth={1.8} />
            ))}
          </svg>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14 }}>
        <button
          type="button"
          onClick={() => {
            setSelectedBranchId(branchId);
            toast.success(`Now acting as ${ws.branch.name} — every screen reflects this branch until you switch back.`);
            close();
          }}
          style={{ border: `1px solid ${BR.border}`, background: "#fff", borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: BR.textSubtle, cursor: "pointer", minHeight: 46 }}
        >
          Act as this branch
        </button>
        <button
          type="button"
          onClick={() => {
            close();
            router.push(`/branches/profile?branch=${branchId}`);
          }}
          style={{ border: `1px solid ${BR.border}`, background: "#fff", borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: BR.textSubtle, cursor: "pointer", minHeight: 46 }}
        >
          Open Branch 360
        </button>
        <button type="button" onClick={close} style={{ gridColumn: "span 2", border: 0, background: BR.primary, borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 48 }}>
          Close
        </button>
      </div>
    </div>
  );
}

interface TransferLine {
  productId: string;
  qty: string;
}

function TransferBody() {
  const { close } = useBranchDrawer();
  const queryClient = useQueryClient();
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const { data: products = [] } = useQuery({ queryKey: ["products", "active"], queryFn: () => fetchProducts({ active: true }) });
  const [destBusinessId, setDestBusinessId] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([{ productId: "", qty: "1" }]);
  const [note, setNote] = useState("");

  function setLine(i: number, patch: Partial<TransferLine>) {
    setLines((prev) => prev.map((l, li) => (li === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { productId: "", qty: "1" }]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, li) => li !== i));
  }

  const validLines = lines.filter((l) => l.productId && Number(l.qty) > 0);
  const totalUnits = validLines.reduce((a, l) => a + Number(l.qty), 0);
  const totalValue = validLines.reduce((a, l) => {
    const p = products.find((pr) => pr.id === l.productId);
    return a + (p ? p.costPrice * Number(l.qty) : 0);
  }, 0);
  // Creation itself doesn't check stock server-side (only `ship` does, once stock actually
  // leaves) — but showing an "over stock" warning while still letting the line through would
  // create a transfer that's guaranteed to fail confusingly later. Block it here instead, so the
  // warning is honest about what happens if you don't fix it.
  const anyOver = validLines.some((l) => {
    const p = products.find((pr) => pr.id === l.productId);
    return p && Number(l.qty) > (p.stockOnHand ?? 0);
  });
  const valid = destBusinessId !== "" && validLines.length > 0 && !anyOver;

  const mutation = useMutation({
    mutationFn: () =>
      createStockTransfer({
        destBusinessId,
        note: note.trim() || undefined,
        items: validLines.map((l) => ({ productId: l.productId, qty: Number(l.qty) })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      toast.success("Transfer requested.");
      close();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this transfer — please try again."),
  });

  const session = useSession();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      <div style={{ background: "#F2F4F7", border: `1px solid ${BR.border}`, borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: BR.textMuted, lineHeight: 1.5 }}>
        Transfers created here always ship from <strong style={{ color: BR.textSubtle }}>{session.business.name}</strong> (the main branch) — the backend has no way to originate a transfer from one child branch to another directly.
      </div>
      <div>
        <label style={label}>To branch</label>
        <select value={destBusinessId} onChange={(e) => setDestBusinessId(e.target.value)} style={selectStyle}>
          <option value="">Select…</option>
          {branches
            .filter((b) => b.id !== session.business.id && b.active)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
      </div>
      <div>
        <div style={label}>Product lines</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {lines.map((l, i) => {
            const product = products.find((p) => p.id === l.productId);
            const over = product && Number(l.qty) > (product.stockOnHand ?? 0);
            return (
              <div key={i} style={{ border: `1px solid ${BR.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <select value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })} style={{ flex: 1, minWidth: 150, border: `1px solid ${BR.border}`, borderRadius: 10, padding: 10, fontSize: 12.5, fontWeight: 700, color: BR.textSubtle, background: "#fff", minHeight: 44 }}>
                    <option value="">Select product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.sku ? `(${p.sku})` : ""}
                      </option>
                    ))}
                  </select>
                  <input type="number" min={0} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} style={{ width: 80, border: `1px solid ${BR.border}`, borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 800, minHeight: 44 }} />
                  {lines.length > 1 && (
                    <button type="button" onClick={() => removeLine(i)} style={{ width: 38, height: 38, border: `1px solid ${BR.border}`, background: "#fff", borderRadius: 9, color: BR.textFaint, cursor: "pointer" }}>
                      ✕
                    </button>
                  )}
                </div>
                {product && (
                  <div style={{ display: "flex", gap: 14, marginTop: 9, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: BR.textFaint }}>
                      Available <strong style={{ color: BR.textSubtle }}>{product.stockOnHand}</strong>
                    </span>
                    <span style={{ fontSize: 11, color: BR.textFaint }}>
                      Line total <strong style={{ color: "#101828" }}>{formatCurrency(product.costPrice * Number(l.qty || 0), session.business.currency)}</strong>
                    </span>
                  </div>
                )}
                {over && (
                  <div style={{ marginTop: 9, background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: 10, padding: "9px 11px", fontSize: 11.5, fontWeight: 600, color: "#912018" }}>
                    Only {product!.stockOnHand} in stock — reduce the quantity.
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" onClick={addLine} style={{ border: "1px dashed #C6CFD8", background: "#fff", borderRadius: 11, padding: 11, fontSize: 12, fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: 44, alignSelf: "flex-start" }}>
            + Add product line
          </button>
        </div>
      </div>
      <div>
        <label style={label}>Note</label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the receiving branch should know" style={{ width: "100%", border: `1px solid ${BR.border}`, borderRadius: 11, padding: 11, fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
      </div>
      <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: 12, padding: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
          <span style={{ fontSize: 12.5, color: "#0E8442" }}>Lines</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: BR.textSubtle }}>{validLines.length}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
          <span style={{ fontSize: 12.5, color: "#0E8442" }}>Total quantity</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: BR.textSubtle }}>{totalUnits}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: "1px solid #D5EFE0", marginTop: 5, paddingTop: 9 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0E8442" }}>Total value</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>{formatCurrency(totalValue, session.business.currency)}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14 }}>
        <button type="button" onClick={close} style={{ border: `1px solid ${BR.border}`, background: "#fff", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: BR.textSubtle, cursor: "pointer", minHeight: 46 }}>
          Cancel
        </button>
        <button type="button" onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending} style={{ flex: 1, border: 0, background: BR.primary, borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46, opacity: !valid || mutation.isPending ? 0.6 : 1 }}>
          {mutation.isPending ? "Creating…" : "Create Transfer"}
        </button>
      </div>
    </div>
  );
}

function HoursBody({ branchId, existing }: { branchId: string; existing: Branch | null }) {
  const { close } = useBranchDrawer();
  const queryClient = useQueryClient();
  const [hours, setHours] = useState<Branch["workingHours"]>(existing?.workingHours ?? {});

  const mutation = useMutation({
    mutationFn: () => updateBranch(branchId, { workingHours: hours }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Hours saved.");
      close();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save hours — please try again."),
  });

  if (!existing) return <div style={{ fontSize: 12.5, color: BR.textFaint }}>Loading…</div>;
  const branch = existing;

  function setDay(key: string, range: [string, string] | null) {
    setHours((prev) => {
      const next = { ...(prev ?? {}) };
      if (range) next[key] = [range];
      else delete next[key];
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      <div style={{ background: "#EEF4FF", border: "1px solid #C7D7FE", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#3538CD", lineHeight: 1.55 }}>
        Editing hours for <strong>{branch.name}</strong>. Closed hours are enforced against bookings.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {DAY_KEYS.map((key, i) => {
          const range = hours[key]?.[0];
          const open = !!range;
          return (
            <div key={key} style={{ border: `1px solid ${BR.border}`, borderRadius: 11, padding: 11, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ width: 88, fontSize: 12, fontWeight: 700, color: BR.textSubtle }}>{DAY_LABELS[i]}</span>
              {open ? (
                <>
                  <input type="time" value={range[0]} onChange={(e) => setDay(key, [e.target.value, range[1]])} style={{ flex: 1, minWidth: 96, border: `1px solid ${BR.border}`, borderRadius: 9, padding: 9, fontSize: 12.5, minHeight: 42 }} />
                  <span style={{ color: BR.textFaint, fontSize: 12 }}>–</span>
                  <input type="time" value={range[1]} onChange={(e) => setDay(key, [range[0], e.target.value])} style={{ flex: 1, minWidth: 96, border: `1px solid ${BR.border}`, borderRadius: 9, padding: 9, fontSize: 12.5, minHeight: 42 }} />
                </>
              ) : (
                <span style={{ flex: 1, fontSize: 12, color: BR.textFaint }}>Closed</span>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 600, color: BR.textMuted, cursor: "pointer", minHeight: 42 }}>
                <input type="checkbox" checked={!open} onChange={(e) => setDay(key, e.target.checked ? null : ["09:00", "18:00"])} style={{ width: 15, height: 15, accentColor: BR.primary }} />
                Closed
              </label>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            const monday = hours.mon?.[0];
            if (!monday) return;
            setHours((prev) => {
              const next = { ...(prev ?? {}) };
              for (const k of DAY_KEYS) next[k] = [monday];
              return next;
            });
          }}
          style={{ border: "1px dashed #C6CFD8", background: "#fff", borderRadius: 10, padding: "10px 13px", fontSize: 11.5, fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: 44 }}
        >
          Copy Monday to all days
        </button>
      </div>
      <div style={{ display: "flex", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14 }}>
        <button type="button" onClick={close} style={{ border: `1px solid ${BR.border}`, background: "#fff", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: BR.textSubtle, cursor: "pointer", minHeight: 46 }}>
          Cancel
        </button>
        <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ flex: 1, border: 0, background: BR.primary, borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46, opacity: mutation.isPending ? 0.6 : 1 }}>
          {mutation.isPending ? "Saving…" : "Save Hours"}
        </button>
      </div>
    </div>
  );
}
