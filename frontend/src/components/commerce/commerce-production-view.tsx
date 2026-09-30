"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchProducts } from "@/lib/products-api";
import {
  cancelWorkOrder,
  completeWorkOrder,
  createBom,
  createWorkOrder,
  fetchBoms,
  fetchProductionSummary,
  fetchWorkOrders,
  releaseWorkOrder,
  requiredComponentQty,
  startWorkOrder,
  type Bom,
  type WorkOrder,
  type WorkOrderStatus,
} from "@/lib/commerce-production-api";

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  planned: "Planned",
  in_progress: "In production",
  quality_hold: "Quality hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

function statusColor(status: WorkOrderStatus) {
  if (status === "completed") return "var(--app-success-text)";
  if (status === "quality_hold") return "var(--app-danger-strong)";
  if (status === "cancelled") return "var(--app-text-disabled)";
  if (status === "in_progress") return "var(--app-info)";
  return "var(--app-text-muted)";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const fieldClass = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
const fieldStyle = { borderColor: "var(--app-border)", background: "var(--app-surface)" };
const primaryButton = "rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone?: "warning" | "danger" }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p
        className="m-0 mt-1 text-2xl font-bold"
        style={{ color: tone === "danger" ? "var(--app-danger-strong)" : tone === "warning" ? "var(--app-warning-text)" : "var(--app-text)" }}
      >
        {value}
      </p>
      <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>{hint}</p>
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`my-auto max-h-[92vh] w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-y-auto rounded-2xl border p-5 shadow-xl`}
        style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold" style={{ color: "var(--app-text-faint)" }}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>
      {label}
      {children}
      {hint && <span className="font-normal" style={{ color: "var(--app-text-faintest)" }}>{hint}</span>}
    </label>
  );
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ["production-summary", "production-boms", "production-work-orders"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

function BomDialog({ onClose }: { onClose: () => void }) {
  const invalidate = useInvalidate();
  const productsQuery = useQuery({ queryKey: ["production-products"], queryFn: () => fetchProducts({ active: true }) });
  const products = (productsQuery.data ?? []).filter((product) => product.kind === "product");
  const [productId, setProductId] = useState("");
  const [rows, setRows] = useState<Array<{ componentProductId: string; qtyPerUnit: string }>>([{ componentProductId: "", qtyPerUnit: "1" }]);
  const [scrap, setScrap] = useState("0");
  const [labor, setLabor] = useState("");
  const [overhead, setOverhead] = useState("");
  const [notes, setNotes] = useState("");

  const save = useMutation({
    mutationFn: () =>
      createBom({
        productId,
        items: rows.map((row) => ({ componentProductId: row.componentProductId, qtyPerUnit: Number(row.qtyPerUnit) })),
        scrapAllowancePct: Number(scrap) || 0,
        laborCostPerUnit: labor.trim() === "" ? null : Number(labor),
        overheadCostPerUnit: overhead.trim() === "" ? null : Number(overhead),
        notes: notes.trim() || undefined,
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success("BOM saved as a new version. The previous version is archived.");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't save this BOM.")),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productId || rows.some((row) => !row.componentProductId || !(Number(row.qtyPerUnit) > 0))) {
      toast.error("Choose the finished product and give every component a quantity above zero.");
      return;
    }
    save.mutate();
  }

  return (
    <Modal title="New BOM version" onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Finished product">
          <select value={productId} onChange={(event) => setProductId(event.target.value)} required className={fieldClass} style={fieldStyle}>
            <option value="">{productsQuery.isLoading ? "Loading products…" : "Choose a product"}</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>
            ))}
          </select>
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>Components per finished unit</span>
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <select
                value={row.componentProductId}
                onChange={(event) => setRows((prev) => prev.map((item, i) => (i === index ? { ...item, componentProductId: event.target.value } : item)))}
                aria-label={`Component ${index + 1}`}
                className={fieldClass}
                style={fieldStyle}
              >
                <option value="">Choose component</option>
                {products
                  .filter((product) => product.id !== productId)
                  .map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
              </select>
              <input
                type="number"
                min={0.0001}
                step="any"
                value={row.qtyPerUnit}
                onChange={(event) => setRows((prev) => prev.map((item, i) => (i === index ? { ...item, qtyPerUnit: event.target.value } : item)))}
                aria-label={`Quantity per unit for component ${index + 1}`}
                className="w-28 rounded-lg border px-3 py-2 text-sm"
                style={fieldStyle}
              />
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                disabled={rows.length === 1}
                className="text-sm font-bold disabled:opacity-30"
                style={{ color: "var(--app-danger-strong)" }}
                aria-label={`Remove component ${index + 1}`}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setRows((prev) => [...prev, { componentProductId: "", qtyPerUnit: "1" }])} className="self-start text-xs font-bold underline">
            Add component
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Scrap allowance %" hint="Extra components expected to be lost">
            <input type="number" min={0} max={100} step="0.01" value={scrap} onChange={(event) => setScrap(event.target.value)} className={fieldClass} style={fieldStyle} />
          </Field>
          <Field label="Labour / unit">
            <input type="number" min={0} step="0.01" value={labor} onChange={(event) => setLabor(event.target.value)} className={fieldClass} style={fieldStyle} />
          </Field>
          <Field label="Overhead / unit">
            <input type="number" min={0} step="0.01" value={overhead} onChange={(event) => setOverhead(event.target.value)} className={fieldClass} style={fieldStyle} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} className={fieldClass} style={fieldStyle} />
        </Field>
        <button type="submit" disabled={save.isPending} className={`self-end ${primaryButton}`} style={{ background: "var(--app-primary)" }}>
          {save.isPending ? "Saving…" : "Save BOM version"}
        </button>
      </form>
    </Modal>
  );
}

function WorkOrderDialog({ boms, currency, onClose }: { boms: Bom[]; currency: string; onClose: () => void }) {
  const invalidate = useInvalidate();
  const active = boms.filter((bom) => bom.status === "active");
  const [bomId, setBomId] = useState(active[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [dueDate, setDueDate] = useState("");
  const [facility, setFacility] = useState("");
  const [demandSource, setDemandSource] = useState("");
  const bom = active.find((item) => item.id === bomId);
  const qtyNumber = Math.max(Number.parseInt(qty, 10) || 0, 0);

  const save = useMutation({
    mutationFn: () =>
      createWorkOrder({
        bomId,
        qtyPlanned: qtyNumber,
        dueDate: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : undefined,
        facility: facility.trim() || undefined,
        demandSource: demandSource.trim() || undefined,
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Work order planned. No stock changes until it's completed.");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't create this work order.")),
  });

  return (
    <Modal title="Plan a work order" onClose={onClose} wide>
      {active.length === 0 ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Create a bill of materials first — a work order needs one.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!bomId || qtyNumber < 1) {
              toast.error("Choose a BOM and a quantity of at least 1.");
              return;
            }
            save.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <Field label="Product (active BOM)">
            <select value={bomId} onChange={(event) => setBomId(event.target.value)} className={fieldClass} style={fieldStyle}>
              {active.map((item) => (
                <option key={item.id} value={item.id}>{item.product.name} · BOM v{item.version}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity to produce">
              <input type="number" min={1} value={qty} onChange={(event) => setQty(event.target.value)} className={fieldClass} style={fieldStyle} />
            </Field>
            <Field label="Due date">
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={fieldClass} style={fieldStyle} />
            </Field>
            <Field label="Facility / workstation">
              <input value={facility} onChange={(event) => setFacility(event.target.value)} maxLength={120} className={fieldClass} style={fieldStyle} />
            </Field>
            <Field label="Demand source" hint="e.g. pre-orders, restock, a customer order">
              <input value={demandSource} onChange={(event) => setDemandSource(event.target.value)} maxLength={200} className={fieldClass} style={fieldStyle} />
            </Field>
          </div>
          {bom && qtyNumber > 0 && (
            <div className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
              <p className="m-0 font-bold">Material requirements (incl. {bom.scrapAllowancePct}% scrap allowance)</p>
              <ul className="mb-0 mt-2 flex flex-col gap-1 pl-5">
                {bom.items.map((item) => {
                  const required = requiredComponentQty(qtyNumber, item.qtyPerUnit, bom.scrapAllowancePct);
                  const short = Math.max(required - item.component.stockQty, 0);
                  return (
                    <li key={item.id} style={{ color: short ? "var(--app-danger-strong)" : "var(--app-text-muted)" }}>
                      {item.component.name}: {required} needed · {item.component.stockQty} in stock
                      {short ? ` · short ${short} — buy via Inventory → Purchases` : ""}
                    </li>
                  );
                })}
              </ul>
              <p className="mb-0 mt-2" style={{ color: "var(--app-text-faint)" }}>
                Estimated cost at today&rsquo;s cost prices: {money(bom.estimatedUnitCost * qtyNumber, currency)}
              </p>
            </div>
          )}
          <button type="submit" disabled={save.isPending} className={`self-end ${primaryButton}`} style={{ background: "var(--app-primary)" }}>
            {save.isPending ? "Saving…" : "Plan work order"}
          </button>
        </form>
      )}
    </Modal>
  );
}

function CompleteDialog({ order, onClose }: { order: WorkOrder; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [good, setGood] = useState(String(order.qtyPlanned));
  const [passed, setPassed] = useState(true);
  const [notes, setNotes] = useState("");
  const goodNumber = Math.min(Math.max(Number.parseInt(good, 10) || 0, 0), order.qtyPlanned);
  const complete = useMutation({
    mutationFn: () =>
      completeWorkOrder(order.id, {
        qtyGood: goodNumber,
        qtyScrap: order.qtyPlanned - goodNumber,
        qualityPassed: passed,
        qualityNotes: notes.trim() || undefined,
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success(
        passed
          ? `Components consumed and ${goodNumber} units added to stock.`
          : "Components consumed. Output is on quality hold and not in sellable stock.",
      );
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't complete this work order.")),
  });
  return (
    <Modal title={`Complete WO-${order.number}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs" style={{ color: "var(--app-text-muted)" }}>
          This consumes every component from stock in one step. If any component ran short, nothing is consumed.
        </p>
        <Field label={`Good units (of ${order.qtyPlanned} planned)`} hint={`Scrap: ${order.qtyPlanned - goodNumber}`}>
          <input type="number" min={0} max={order.qtyPlanned} value={good} onChange={(event) => setGood(event.target.value)} className={fieldClass} style={fieldStyle} />
        </Field>
        <fieldset className="flex flex-col gap-1 text-xs">
          <legend className="font-semibold" style={{ color: "var(--app-text-muted)" }}>Quality check</legend>
          <label className="flex items-center gap-2"><input type="radio" checked={passed} onChange={() => setPassed(true)} /> Passed — add good units to stock</label>
          <label className="flex items-center gap-2"><input type="radio" checked={!passed} onChange={() => setPassed(false)} /> Failed — put output on quality hold</label>
        </fieldset>
        <Field label="Quality notes">
          <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} className={fieldClass} style={fieldStyle} />
        </Field>
        <button type="button" onClick={() => complete.mutate()} disabled={complete.isPending} className={`self-end ${primaryButton}`} style={{ background: "var(--app-primary)" }}>
          {complete.isPending ? "Completing…" : "Complete work order"}
        </button>
      </div>
    </Modal>
  );
}

function ReasonDialog({
  title,
  description,
  qtyLabel,
  maxQty,
  confirmLabel,
  danger,
  onSubmit,
  onClose,
}: {
  title: string;
  description: string;
  qtyLabel?: string;
  maxQty?: number;
  confirmLabel: string;
  danger?: boolean;
  onSubmit: (input: { reason: string; qty: number }) => Promise<unknown>;
  onClose: () => void;
}) {
  const invalidate = useInvalidate();
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState(String(maxQty ?? 0));
  const run = useMutation({
    mutationFn: () => onSubmit({ reason: reason.trim(), qty: Math.min(Math.max(Number.parseInt(qty, 10) || 0, 0), maxQty ?? 0) }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Saved.");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't save this change.")),
  });
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs" style={{ color: "var(--app-text-muted)" }}>{description}</p>
        {qtyLabel && (
          <Field label={qtyLabel}>
            <input type="number" min={0} max={maxQty} value={qty} onChange={(event) => setQty(event.target.value)} className={fieldClass} style={fieldStyle} />
          </Field>
        )}
        <Field label="Reason (kept in the audit log)">
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className={fieldClass} style={fieldStyle} />
        </Field>
        <button
          type="button"
          onClick={() => run.mutate()}
          disabled={run.isPending || reason.trim().length < 3}
          className={`self-end ${primaryButton}`}
          style={{ background: danger ? "var(--app-danger-strong)" : "var(--app-primary)" }}
        >
          {run.isPending ? "Saving…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function CommerceProductionView() {
  useModuleHeader({
    title: "Production & Assembly",
    subtitle: "Plan work orders from bills of materials; stock moves in Inventory only when a run is completed.",
  });

  const session = useSession();
  const currency = session.business.currency || "USD";
  const invalidate = useInvalidate();
  const [tab, setTab] = useState<"orders" | "boms">("orders");
  const [dialog, setDialog] = useState<
    | { kind: "bom" }
    | { kind: "work-order" }
    | { kind: "complete" | "release" | "cancel"; order: WorkOrder }
    | null
  >(null);

  const summaryQuery = useQuery({ queryKey: ["production-summary"], queryFn: fetchProductionSummary });
  const bomsQuery = useQuery({ queryKey: ["production-boms"], queryFn: fetchBoms });
  const ordersQuery = useQuery({ queryKey: ["production-work-orders"], queryFn: fetchWorkOrders });
  const start = useMutation({
    mutationFn: startWorkOrder,
    onSuccess: async () => {
      await invalidate();
      toast.success("Work order started.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't start this work order.")),
  });

  const summary = summaryQuery.data;
  const boms = bomsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const loading = summaryQuery.isLoading;

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p
        className="m-0 rounded-xl border px-4 py-3 text-xs"
        style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}
      >
        Products and stock stay in <Link href="/products" className="font-bold underline">Products</Link> and{" "}
        <Link href="/inventory" className="font-bold underline">Inventory</Link>. Completing a work order consumes its components and
        adds good units as stock movements; quality-held output isn&rsquo;t sellable until released. Costs use each product&rsquo;s cost
        price plus the BOM&rsquo;s labour and overhead. Buy missing components through Inventory → Purchases. Capacity planning,
        a production calendar and subcontracting aren&rsquo;t available yet.
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Open work orders" value={loading ? "…" : summary?.openWorkOrders ?? "—"} hint="Planned or in production" />
        <Kpi label="Units in production" value={loading ? "…" : summary?.unitsInProduction ?? "—"} hint="Started, not yet completed" />
        <Kpi label="Material shortages" value={loading ? "…" : summary?.withShortages ?? "—"} hint="Open orders short on a component" tone={summary?.withShortages ? "warning" : undefined} />
        <Kpi label="Late" value={loading ? "…" : summary?.late ?? "—"} hint="Past due and still open" tone={summary?.late ? "danger" : undefined} />
        <Kpi label="Quality holds" value={loading ? "…" : summary?.qualityHolds ?? "—"} hint="Output not yet sellable" tone={summary?.qualityHolds ? "warning" : undefined} />
        <Kpi
          label="Scrap rate"
          value={loading ? "…" : summary?.scrapRatePct === null || summary === undefined ? "—" : `${summary.scrapRatePct}%`}
          hint={summary?.completedCount ? `Across ${summary.completedCount} completed runs` : "No completed runs yet"}
        />
        <Kpi
          label="Cost variance"
          value={loading ? "…" : summary?.costVariance === null || summary === undefined ? "—" : money(summary.costVariance, currency)}
          hint="Actual − estimated, completed runs"
          tone={summary?.costVariance && summary.costVariance > 0 ? "warning" : undefined}
        />
      </section>

      <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 pt-3" style={{ borderColor: "var(--app-border)" }}>
          <div role="tablist" className="flex gap-4">
            {(
              [
                ["orders", `Work orders (${orders.length})`],
                ["boms", `Bills of materials (${boms.filter((bom) => bom.status === "active").length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className="border-b-2 pb-2.5 text-sm font-bold"
                style={{ borderColor: tab === key ? "var(--app-primary)" : "transparent", color: tab === key ? "var(--app-text)" : "var(--app-text-faint)" }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setDialog({ kind: tab === "orders" ? "work-order" : "bom" })}
            className="mb-2.5 rounded-lg px-3 py-2 text-xs font-bold text-white"
            style={{ background: "var(--app-primary)" }}
          >
            {tab === "orders" ? "Plan work order" : "New BOM version"}
          </button>
        </div>

        {tab === "orders" ? (
          ordersQuery.isLoading ? (
            <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading work orders…</p>
          ) : ordersQuery.isError ? (
            <div className="flex flex-wrap items-center gap-3 p-6 text-sm" style={{ color: "var(--app-danger-strong)" }}>
              {errorMessage(ordersQuery.error, "Couldn't load work orders.")}
              <button type="button" onClick={() => ordersQuery.refetch()} className="font-bold underline">Retry</button>
            </div>
          ) : orders.length === 0 ? (
            <div className="p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>
              <p className="m-0 font-semibold" style={{ color: "var(--app-text)" }}>No work orders yet.</p>
              <p className="mb-0 mt-1">Create a bill of materials for a product you make or assemble, then plan a work order from it.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead style={{ color: "var(--app-text-faint)", background: "var(--app-surface-2)" }}>
                  <tr>
                    <th className="px-4 py-3 font-semibold">Work order</th>
                    <th className="px-4 py-3 font-semibold">Quantity</th>
                    <th className="px-4 py-3 font-semibold">Due</th>
                    <th className="px-4 py-3 font-semibold">Materials</th>
                    <th className="px-4 py-3 font-semibold">Cost (est. / actual)</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                      <td className="px-4 py-3">
                        <p className="m-0 font-semibold">WO-{order.number} · {order.product.name}</p>
                        <p className="m-0 mt-0.5" style={{ color: "var(--app-text-faintest)" }}>
                          BOM v{order.bom.version}
                          {order.facility ? ` · ${order.facility}` : ""}
                          {order.demandSource ? ` · for ${order.demandSource}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {order.qtyPlanned} planned
                        {order.qtyGood !== null && (
                          <span className="block" style={{ color: "var(--app-text-faintest)" }}>
                            {order.qtyGood} good · {order.qtyScrap ?? 0} scrap
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: order.late ? "var(--app-danger-strong)" : undefined }}>
                        {order.dueDate ? formatDate(order.dueDate) : "—"}
                        {order.late ? " · late" : ""}
                      </td>
                      <td className="px-4 py-3">
                        {order.status === "planned" || order.status === "in_progress" ? (
                          order.materialsReady ? (
                            <span style={{ color: "var(--app-success-text)" }}>All in stock</span>
                          ) : (
                            order.materials
                              .filter((material) => material.shortage > 0)
                              .map((material) => (
                                <span key={material.component.id} className="block" style={{ color: "var(--app-danger-strong)" }}>
                                  {material.component.name}: short {material.shortage}
                                </span>
                              ))
                          )
                        ) : order.status === "cancelled" ? (
                          <span style={{ color: "var(--app-text-faintest)" }}>Not consumed</span>
                        ) : (
                          <span style={{ color: "var(--app-text-faintest)" }}>Consumed</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {money(order.estimatedCost, currency)} / {order.actualCost === null ? "—" : money(order.actualCost, currency)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold" style={{ color: statusColor(order.status) }}>{STATUS_LABEL[order.status]}</span>
                        {order.qualityNotes && <span className="block" style={{ color: "var(--app-text-faint)" }}>{order.qualityNotes}</span>}
                        {order.cancelledReason && <span className="block" style={{ color: "var(--app-text-faint)" }}>{order.cancelledReason}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {order.status === "planned" && (
                            <button type="button" onClick={() => start.mutate(order.id)} disabled={start.isPending} className="font-bold underline">Start</button>
                          )}
                          {order.status === "in_progress" && (
                            <button type="button" onClick={() => setDialog({ kind: "complete", order })} className="font-bold underline">Complete</button>
                          )}
                          {order.status === "quality_hold" && (
                            <button type="button" onClick={() => setDialog({ kind: "release", order })} className="font-bold underline">Release</button>
                          )}
                          {(order.status === "planned" || order.status === "in_progress") && (
                            <button type="button" onClick={() => setDialog({ kind: "cancel", order })} className="font-bold underline" style={{ color: "var(--app-danger-strong)" }}>
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : bomsQuery.isLoading ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading bills of materials…</p>
        ) : bomsQuery.isError ? (
          <div className="flex flex-wrap items-center gap-3 p-6 text-sm" style={{ color: "var(--app-danger-strong)" }}>
            {errorMessage(bomsQuery.error, "Couldn't load bills of materials.")}
            <button type="button" onClick={() => bomsQuery.refetch()} className="font-bold underline">Retry</button>
          </div>
        ) : boms.length === 0 ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>
            No bills of materials yet. A BOM lists the components (from Products) that make one finished unit.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)", background: "var(--app-surface-2)" }}>
                <tr>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Components per unit</th>
                  <th className="px-4 py-3 font-semibold">Scrap / labour / overhead</th>
                  <th className="px-4 py-3 font-semibold">Est. unit cost</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {boms.map((bom) => (
                  <tr key={bom.id} className="border-t align-top" style={{ borderColor: "var(--app-border)", opacity: bom.status === "archived" ? 0.6 : 1 }}>
                    <td className="px-4 py-3">
                      <p className="m-0 font-semibold">{bom.product.name}</p>
                      <p className="m-0 mt-0.5" style={{ color: "var(--app-text-faintest)" }}>Version {bom.version} · {formatDate(bom.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      {bom.items.map((item) => (
                        <span key={item.id} className="block">
                          {item.qtyPerUnit} × {item.component.name}{" "}
                          <span style={{ color: "var(--app-text-faintest)" }}>({item.component.stockQty} in stock)</span>
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-3">
                      {bom.scrapAllowancePct}% · {bom.laborCostPerUnit === null ? "no labour" : money(bom.laborCostPerUnit, currency)} ·{" "}
                      {bom.overheadCostPerUnit === null ? "no overhead" : money(bom.overheadCostPerUnit, currency)}
                    </td>
                    <td className="px-4 py-3">{money(bom.estimatedUnitCost, currency)}</td>
                    <td className="px-4 py-3" style={{ color: bom.status === "active" ? "var(--app-success-text)" : "var(--app-text-faint)" }}>
                      {bom.status === "active" ? "Active" : "Archived"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog?.kind === "bom" && <BomDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "work-order" && <WorkOrderDialog boms={boms} currency={currency} onClose={() => setDialog(null)} />}
      {dialog?.kind === "complete" && <CompleteDialog order={dialog.order} onClose={() => setDialog(null)} />}
      {dialog?.kind === "release" && (
        <ReasonDialog
          title={`Release WO-${dialog.order.number} from quality hold`}
          description="Released units are added to stock. Any held units you don't release are recorded as scrap."
          qtyLabel={`Units to release (of ${dialog.order.qtyGood ?? 0} on hold)`}
          maxQty={dialog.order.qtyGood ?? 0}
          confirmLabel="Release units"
          onSubmit={({ reason, qty }) => releaseWorkOrder(dialog.order.id, { qtyReleased: qty, reason })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "cancel" && (
        <ReasonDialog
          title={`Cancel WO-${dialog.order.number}?`}
          description="Nothing has been consumed yet, so cancelling doesn't change any stock."
          confirmLabel="Cancel work order"
          danger
          onSubmit={({ reason }) => cancelWorkOrder(dialog.order.id, reason)}
          onClose={() => setDialog(null)}
        />
      )}
    </main>
  );
}
