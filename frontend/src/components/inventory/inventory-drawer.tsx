"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X as XIcon } from "lucide-react";
import {
  fetchInventory,
  fetchStockMovements,
  fetchReorderSuggestions,
  recordWastage,
  type WastageReason,
  type MovementKind,
} from "@/lib/inventory-api";
import { fetchSuppliers } from "@/lib/suppliers-api";
import { fetchProducts } from "@/lib/products-api";
import { createPurchaseOrder } from "@/lib/purchase-orders-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useInventoryDrawer } from "@/components/inventory/inventory-drawer-context";
import { INV, Chip, InventoryDrawerShell, fieldLabelStyle, fieldInputStyle, fieldSelectStyle, type Tone } from "@/components/inventory/inventory-ui";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const KIND_TONE: Record<MovementKind, Tone> = {
  purchase: "green",
  sale: "blue",
  wastage: "red",
  adjustment: "amber",
  return: "neutral",
  transfer_out: "purple",
  transfer_in: "purple",
};
const KIND_LABEL: Record<MovementKind, string> = {
  purchase: "Purchase",
  sale: "Sale",
  wastage: "Wastage",
  adjustment: "Adjustment",
  return: "Return",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
};

export function InventoryDrawer() {
  const { drawer, close } = useInventoryDrawer();
  if (!drawer) return null;

  const title = drawer.mode === "history" ? "Movement History" : drawer.mode === "po" ? "New Purchase Order" : drawer.mode === "wastage" ? "Record Wastage" : "Suggestion Rationale";

  return (
    <InventoryDrawerShell title={title} onClose={close}>
      {drawer.mode === "history" && <HistoryBody productId={drawer.productId} />}
      {drawer.mode === "po" && <PoBody supplierId={drawer.supplierId} prefill={drawer.prefill} />}
      {drawer.mode === "wastage" && <WastageBody productId={drawer.productId} />}
      {drawer.mode === "rationale" && <RationaleBody productId={drawer.productId} />}
    </InventoryDrawerShell>
  );
}

function HistoryBody({ productId }: { productId: string }) {
  const router = useRouter();
  const { close } = useInventoryDrawer();
  const session = useSession();
  const { data: items = [] } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });
  const item = items.find((i) => i.id === productId);
  const { data: movements = [], isPending } = useQuery({
    queryKey: ["stock-movements", productId],
    queryFn: () => fetchStockMovements({ productId }),
  });

  if (!item) return <div style={{ fontSize: 12.5, color: INV.textFaint }}>Loading…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{item.name}</div>
        <div style={{ fontSize: 12, color: INV.textFaint, marginTop: 3 }}>{item.supplier ?? "No supplier on record"}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ border: `1px solid ${INV.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: INV.textMuted }}>On hand</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#0F172A", marginTop: 4 }}>{item.stockQty}</div>
        </div>
        <div style={{ border: `1px solid ${INV.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: INV.textMuted }}>Value at cost</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#0F172A", marginTop: 4 }}>{formatCurrency(item.stockValue, session.business.currency)}</div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: INV.textFaint, marginBottom: 9 }}>Movement timeline</div>
        {isPending ? (
          <div style={{ fontSize: 12.5, color: INV.textFaint }}>Loading…</div>
        ) : movements.length === 0 ? (
          <div style={{ border: `1px solid ${INV.border}`, borderRadius: 12, padding: 24, textAlign: "center", fontSize: 12.5, color: INV.textFaint }}>No movements recorded for this product yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {movements.slice(0, 20).map((m) => (
              <div key={m.id} style={{ border: `1px solid ${INV.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <Chip tone={KIND_TONE[m.kind]} style={{ height: 21, fontSize: 10 }}>
                    {KIND_LABEL[m.kind]}
                  </Chip>
                  <span style={{ fontSize: 11.5, color: INV.textFaint }}>{formatDate(m.createdAt)}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: m.qty > 0 ? "#0E8442" : "#B42318", marginLeft: "auto" }}>
                    {m.qty > 0 ? "+" : ""}
                    {m.qty}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 9, flexWrap: "wrap" }}>
                  {m.unitCost != null && (
                    <span style={{ fontSize: 11, color: INV.textFaint }}>
                      Unit cost <strong style={{ color: INV.textSubtle }}>{formatCurrency(m.unitCost, session.business.currency)}</strong>
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: INV.textFaint }}>
                    Balance after <strong style={{ color: "#101828" }}>{m.resultingBalance}</strong>
                  </span>
                  {m.supplierName && <span style={{ fontSize: 11, color: INV.textFaint }}>{m.supplierName}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14 }}>
        <button
          type="button"
          onClick={() => {
            close();
            router.push("/inventory/movements");
          }}
          style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: INV.textSubtle, cursor: "pointer", minHeight: 46 }}
        >
          All movements
        </button>
        <button type="button" onClick={close} style={{ border: 0, background: INV.primary, borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
          Close
        </button>
      </div>
    </div>
  );
}

interface PoLine {
  productId: string;
  qty: string;
  unitCost: string;
}

function PoBody({ supplierId: initialSupplierId, prefill }: { supplierId?: string; prefill?: { productId: string; qty: number }[] }) {
  const { close } = useInventoryDrawer();
  const queryClient = useQueryClient();
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers });
  const { data: products = [] } = useQuery({ queryKey: ["products", "active"], queryFn: () => fetchProducts({ active: true }) });
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<PoLine[]>(
    prefill && prefill.length > 0 ? prefill.map((p) => ({ productId: p.productId, qty: String(p.qty), unitCost: "" })) : [{ productId: "", qty: "1", unitCost: "" }],
  );

  function setLine(i: number, patch: Partial<PoLine>) {
    setLines((prev) => prev.map((l, li) => (li === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { productId: "", qty: "1", unitCost: "" }]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, li) => li !== i));
  }

  const validLines = lines.filter((l) => l.productId && Number(l.qty) > 0 && l.unitCost !== "");
  const total = validLines.reduce((a, l) => a + Number(l.qty) * Number(l.unitCost), 0);
  const valid = supplierId !== "" && validLines.length > 0;

  const mutation = useMutation({
    mutationFn: () =>
      createPurchaseOrder({
        supplierId,
        note: note.trim() || undefined,
        items: validLines.map((l) => ({ productId: l.productId, qty: Number(l.qty), unitCost: Number(l.unitCost) })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Draft purchase order created.");
      close();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this order — please try again."),
  });

  const session = useSession();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      <div>
        <label style={fieldLabelStyle}>Supplier</label>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={fieldSelectStyle}>
          <option value="">Select…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <div style={fieldLabelStyle}>Product lines</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {lines.map((l, i) => {
            const product = products.find((p) => p.id === l.productId);
            const subtotal = product ? Number(l.qty || 0) * Number(l.unitCost || 0) : 0;
            return (
              <div key={i} style={{ border: `1px solid ${INV.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <select value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })} style={{ flex: 1, minWidth: 140, border: `1px solid ${INV.border}`, borderRadius: 10, padding: 10, fontSize: 12.5, fontWeight: 700, color: INV.textSubtle, background: "#fff", minHeight: 44 }}>
                    <option value="">Select product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeLine(i)} aria-label="Remove line" style={{ width: 38, height: 38, border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 9, color: INV.textFaint, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <XIcon size={14} />
                  </button>
                </div>
                <div style={{ display: "flex", gap: 9, marginTop: 9, flexWrap: "wrap" }}>
                  <span style={{ flex: 1, minWidth: 110 }}>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: INV.textFaint, marginBottom: 4 }}>QUANTITY</label>
                    <input type="number" min={0} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} style={{ width: "100%", border: `1px solid ${INV.border}`, borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 800, minHeight: 44 }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 110 }}>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: INV.textFaint, marginBottom: 4 }}>UNIT COST</label>
                    <input type="number" min={0} value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} style={{ width: "100%", border: `1px solid ${INV.border}`, borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 800, minHeight: 44 }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 110 }}>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: INV.textFaint, marginBottom: 4 }}>SUBTOTAL</label>
                    <span style={{ display: "flex", alignItems: "center", height: 44, fontSize: 13, fontWeight: 800, color: "#101828" }}>{formatCurrency(subtotal, session.business.currency)}</span>
                  </span>
                </div>
              </div>
            );
          })}
          <button type="button" onClick={addLine} style={{ border: "1px dashed #C6CFD8", background: "#fff", borderRadius: 11, padding: 11, fontSize: 12, fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: 44, alignSelf: "flex-start" }}>
            <Plus size={13} style={{ display: "inline", marginRight: 4, verticalAlign: -2 }} />
            Add product line
          </button>
        </div>
      </div>
      <div>
        <label style={fieldLabelStyle}>Notes</label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the supplier should know" style={{ width: "100%", border: `1px solid ${INV.border}`, borderRadius: 11, padding: 11, fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
      </div>
      <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: 12, padding: 13, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0E8442" }}>Total cost</span>
        <span style={{ fontSize: 19, fontWeight: 800, color: "#0F172A" }}>{formatCurrency(total, session.business.currency)}</span>
      </div>
      <div style={{ display: "flex", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14 }}>
        <button type="button" onClick={close} style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: INV.textSubtle, cursor: "pointer", minHeight: 46 }}>
          Cancel
        </button>
        <button type="button" onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending} style={{ flex: 1, border: 0, background: INV.primary, borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46, opacity: !valid || mutation.isPending ? 0.6 : 1 }}>
          {mutation.isPending ? "Creating…" : "Create Purchase Order"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: INV.textFaint, lineHeight: 1.5 }}>Created as a draft — nothing is sent to the supplier until you send it from Purchases. Expected date and per-branch routing aren&apos;t tracked on a purchase order in this build.</div>
    </div>
  );
}

function WastageBody({ productId: initialProductId }: { productId?: string }) {
  const { close } = useInventoryDrawer();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });
  const [productId, setProductId] = useState(initialProductId ?? "");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<WastageReason>("Damaged");
  const [note, setNote] = useState("");

  const item = items.find((i) => i.id === productId);
  const over = item != null && qty !== "" && Number(qty) > item.stockQty;
  const valid = item != null && qty.trim() !== "" && Number(qty) > 0 && !over;

  const mutation = useMutation({
    mutationFn: () => recordWastage({ productId, qty: Number(qty), reason, note: note.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      toast.success(`Recorded ${qty} units of ${item?.name} as wastage.`);
      close();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't record this wastage — please try again."),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      <div>
        <label style={fieldLabelStyle}>Product</label>
        <select value={productId} onChange={(e) => setProductId(e.target.value)} style={fieldSelectStyle}>
          <option value="">Select…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        {item && (
          <div style={{ fontSize: 11.5, color: INV.textMuted, marginTop: 7 }}>
            Currently in stock: <strong style={{ color: "#101828" }}>{item.stockQty}</strong>
          </div>
        )}
      </div>
      <div>
        <label style={fieldLabelStyle}>Quantity to write off</label>
        <input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" style={{ ...fieldInputStyle, fontSize: 18, fontWeight: 800, minHeight: 52 }} />
        {over && (
          <div style={{ marginTop: 9, background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: 11, padding: "11px 13px", fontSize: 12, fontWeight: 600, color: "#912018" }}>
            You only have {item!.stockQty} in stock. Wastage cannot exceed what you actually hold.
          </div>
        )}
      </div>
      <div>
        <label style={fieldLabelStyle}>Reason</label>
        <select value={reason} onChange={(e) => setReason(e.target.value as WastageReason)} style={fieldSelectStyle}>
          <option>Damaged</option>
          <option>Expired</option>
          <option>Theft</option>
          <option>Other</option>
        </select>
      </div>
      <div>
        <label style={fieldLabelStyle}>Note</label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened" style={{ width: "100%", border: `1px solid ${INV.border}`, borderRadius: 11, padding: 11, fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
      </div>
      <div style={{ border: "1px dashed #D5DCE4", borderRadius: 12, padding: 16, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: INV.textMuted }}>Photo attachment — not available in this build</div>
        <div style={{ fontSize: 11, color: INV.textFaint, marginTop: 4 }}>Only quantity, reason and a text note are recorded for now.</div>
      </div>
      <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#93370D", lineHeight: 1.55 }}>
        This reduces stock and lowers profit for the period — that is the point. It writes a wastage movement you can audit later.
      </div>
      <div style={{ display: "flex", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14 }}>
        <button type="button" onClick={close} style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 700, color: INV.textSubtle, cursor: "pointer", minHeight: 46 }}>
          Cancel
        </button>
        <button type="button" onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending} style={{ flex: 1, border: 0, background: INV.primary, borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46, opacity: !valid || mutation.isPending ? 0.6 : 1 }}>
          {mutation.isPending ? "Recording…" : "Record Wastage"}
        </button>
      </div>
    </div>
  );
}

function RationaleBody({ productId }: { productId: string }) {
  const { close, openPo } = useInventoryDrawer();
  const { data: groups = [] } = useQuery({ queryKey: ["reorder-suggestions"], queryFn: fetchReorderSuggestions });
  const group = groups.find((g) => g.items.some((i) => i.productId === productId));
  const item = group?.items.find((i) => i.productId === productId);

  if (!item || !group) return <div style={{ fontSize: 12.5, color: INV.textFaint }}>Loading…</div>;

  const daysOfCover = item.velocityPerDay > 0 ? Math.floor(item.currentStock / item.velocityPerDay) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{item.name}</div>
        <div style={{ fontSize: 12, color: INV.textFaint, marginTop: 3 }}>
          Suggested quantity: <strong style={{ color: "#0E8442" }}>{item.suggestedQty}</strong>
        </div>
      </div>
      <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 12, padding: "12px 14px", fontSize: 12, color: "#93370D", lineHeight: 1.55 }}>
        This is a suggestion from your own sales history, not an optimal stock level. Your judgement about upcoming demand beats the arithmetic.
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: INV.textFaint, marginBottom: 9 }}>The arithmetic</div>
        <div style={{ border: `1px solid ${INV.border}`, borderRadius: 12, padding: 13, display: "flex", flexDirection: "column", gap: 8 }}>
          <Row label="Current stock" value={String(item.currentStock)} />
          <Row label="Average daily velocity (last 30 days)" value={`${item.velocityPerDay}/day`} />
          <Row label="Days of cover left" value={daysOfCover != null ? `${daysOfCover} days` : "No recent sales"} valueColor="#B54708" />
          <div style={{ borderTop: "1px solid #F2F4F7", paddingTop: 9, marginTop: 3 }}>
            <Row label="Target lead-time cover" value="14 days" />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#0E8442" }}>Suggested order</span>
            <span style={{ fontSize: 19, fontWeight: 800, color: "#0F172A" }}>{item.suggestedQty}</span>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: INV.textFaint, marginTop: 8, lineHeight: 1.55 }}>(Velocity × 14-day lead time) + reorder threshold − current stock, rounded up.</div>
      </div>
      <div>
        <Row label="Supplier" value={group.supplierName} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, borderTop: "1px solid #F0F2F5", paddingTop: 14 }}>
        <button type="button" onClick={close} style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: INV.textSubtle, cursor: "pointer", minHeight: 46 }}>
          Close
        </button>
        <button
          type="button"
          onClick={() => openPo({ supplierId: group.supplierId !== "unassigned" ? group.supplierId : undefined, prefill: [{ productId: item.productId, qty: item.suggestedQty }] })}
          style={{ border: 0, background: INV.primary, borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}
        >
          Create PO
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ fontSize: 12.5, color: INV.textMuted }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: valueColor ?? INV.textSubtle }}>{value}</span>
    </div>
  );
}
