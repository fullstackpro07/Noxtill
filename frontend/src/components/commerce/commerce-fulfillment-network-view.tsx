"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchSuppliers } from "@/lib/suppliers-api";
import {
  createFulfillmentNode,
  disableFulfillmentNode,
  enableFulfillmentNode,
  fetchFulfillmentBranches,
  fetchFulfillmentCoverage,
  fetchFulfillmentNodes,
  removeFulfillmentMapping,
  setFulfillmentMapping,
  updateFulfillmentNode,
  type FulfillmentCoverage,
  type FulfillmentCoverageRow,
  type FulfillmentMappingRole,
  type FulfillmentNode,
  type FulfillmentNodeInput,
  type FulfillmentNodeType,
} from "@/lib/commerce-fulfillment-api";

const TYPE_LABEL: Record<FulfillmentNodeType, string> = {
  own_location: "Own location (branch)",
  third_party_warehouse: "3PL warehouse",
  dropship_supplier: "Dropship supplier",
  print_on_demand: "Print on demand",
  manufacturer: "Manufacturer",
  marketplace_fulfillment: "Marketplace fulfilment (e.g. FBA)",
  other: "Other",
};

const SUPPLIER_TYPES = new Set<FulfillmentNodeType>(["dropship_supplier", "print_on_demand", "manufacturer"]);

const COVERAGE_LABEL: Record<FulfillmentCoverage, string> = {
  covered: "Primary + backup",
  no_backup: "No backup",
  primary_unavailable: "Primary disabled",
  gap: "No active source",
};

function coverageStyle(value: FulfillmentCoverage) {
  if (value === "covered") {
    return { color: "var(--app-success-text)", background: "var(--app-success-bg)", borderColor: "var(--app-success-border)" };
  }
  if (value === "gap") {
    return { color: "var(--app-danger-strong)", background: "var(--app-surface-2)", borderColor: "var(--app-border)" };
  }
  return { color: "var(--app-warning-text)", background: "var(--app-warning-bg)", borderColor: "var(--app-warning-border)" };
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

const fieldClass =
  "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
const fieldStyle = { borderColor: "var(--app-border)", background: "var(--app-surface)" };

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone?: "warning" | "danger" }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p
        className="m-0 mt-1 text-2xl font-bold"
        style={{
          color: tone === "danger" ? "var(--app-danger-strong)" : tone === "warning" ? "var(--app-warning-text)" : "var(--app-text)",
        }}
      >
        {value}
      </p>
      <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>{hint}</p>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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
        className="my-auto max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border p-5 shadow-xl"
        style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
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

function NodeDialog({ node, onClose }: { node: FulfillmentNode | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const branchesQuery = useQuery({ queryKey: ["fulfillment-branches"], queryFn: fetchFulfillmentBranches });
  const suppliersQuery = useQuery({ queryKey: ["fulfillment-suppliers"], queryFn: fetchSuppliers });
  const [name, setName] = useState(node?.name ?? "");
  const [type, setType] = useState<FulfillmentNodeType>(node?.type ?? "own_location");
  const [branchId, setBranchId] = useState(node?.branch?.id ?? "");
  const [supplierId, setSupplierId] = useState(node?.supplier?.id ?? "");
  const [country, setCountry] = useState(node?.country ?? "");
  const [marketsText, setMarketsText] = useState((node?.serviceMarkets ?? []).join(", "));
  const [processingDays, setProcessingDays] = useState(node?.processingDays?.toString() ?? "");
  const [cutoffTime, setCutoffTime] = useState(node?.cutoffTime ?? "");
  const [cost, setCost] = useState(node?.costPerOrder?.toString() ?? "");
  const [capacity, setCapacity] = useState(node?.dailyCapacity?.toString() ?? "");
  const [notes, setNotes] = useState(node?.notes ?? "");

  const save = useMutation({
    mutationFn: (input: FulfillmentNodeInput) =>
      node
        ? updateFulfillmentNode(node.id, input)
        : createFulfillmentNode({ ...input, name: name.trim(), type }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fulfillment-nodes"] }),
        queryClient.invalidateQueries({ queryKey: ["fulfillment-coverage"] }),
      ]);
      toast.success(node ? "Fulfilment node updated." : "Fulfilment node added.");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't save this fulfilment node.")),
  });

  const optionalInt = (value: string) => (value.trim() === "" ? null : Number.parseInt(value, 10));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const serviceMarkets = marketsText
      .split(/[,\s]+/)
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);
    if (serviceMarkets.some((code) => !/^[A-Z]{2}$/.test(code))) {
      toast.error("Service markets must be 2-letter country codes, e.g. US, GB, PK.");
      return;
    }
    save.mutate({
      name: name.trim(),
      branchBusinessId: type === "own_location" ? branchId || null : null,
      supplierId: SUPPLIER_TYPES.has(type) ? supplierId || null : null,
      country: country.trim() ? country.trim().toUpperCase() : null,
      serviceMarkets,
      processingDays: optionalInt(processingDays),
      cutoffTime: cutoffTime || null,
      costPerOrder: cost.trim() === "" ? null : Number(cost),
      dailyCapacity: optionalInt(capacity),
      notes: notes.trim() || null,
    });
  }

  const suppliers = suppliersQuery.data ?? [];
  const branches = branchesQuery.data ?? [];

  return (
    <Modal title={node ? `Edit ${node.name}` : "Add fulfilment node"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Name">
          <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} className={fieldClass} style={fieldStyle} />
        </Field>
        <Field label="Type" hint={node ? "The type can't be changed after creation." : undefined}>
          <select value={type} onChange={(event) => setType(event.target.value as FulfillmentNodeType)} disabled={Boolean(node)} className={fieldClass} style={fieldStyle}>
            {(Object.keys(TYPE_LABEL) as FulfillmentNodeType[]).map((key) => (
              <option key={key} value={key}>{TYPE_LABEL[key]}</option>
            ))}
          </select>
        </Field>
        {type === "own_location" && (
          <Field label="Branch" hint="Stock for this node is read live from this branch's products, matched by SKU.">
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)} required className={fieldClass} style={fieldStyle}>
              <option value="">{branchesQuery.isLoading ? "Loading branches…" : "Choose a branch"}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </Field>
        )}
        {SUPPLIER_TYPES.has(type) && (
          <Field label={type === "dropship_supplier" ? "Supplier" : "Supplier (optional)"}>
            <select
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              required={type === "dropship_supplier"}
              className={fieldClass}
              style={fieldStyle}
            >
              <option value="">{suppliersQuery.isLoading ? "Loading suppliers…" : "Choose a supplier"}</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
            {!suppliersQuery.isLoading && suppliers.length === 0 && (
              <span className="font-normal">
                No suppliers yet — add one in{" "}
                <Link href="/products/suppliers" className="font-bold underline">Products → Suppliers</Link>.
              </span>
            )}
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ships from (country)" hint="2-letter code, e.g. US">
            <input value={country} onChange={(event) => setCountry(event.target.value)} maxLength={2} className={fieldClass} style={fieldStyle} />
          </Field>
          <Field label="Serves markets" hint="Comma-separated codes">
            <input value={marketsText} onChange={(event) => setMarketsText(event.target.value)} placeholder="US, CA" className={fieldClass} style={fieldStyle} />
          </Field>
          <Field label="Processing time (days)">
            <input type="number" min={0} max={365} value={processingDays} onChange={(event) => setProcessingDays(event.target.value)} className={fieldClass} style={fieldStyle} />
          </Field>
          <Field label="Same-day cutoff" hint="Business timezone">
            <input type="time" value={cutoffTime} onChange={(event) => setCutoffTime(event.target.value)} className={fieldClass} style={fieldStyle} />
          </Field>
          <Field label="Cost per order">
            <input type="number" min={0} step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} className={fieldClass} style={fieldStyle} />
          </Field>
          <Field label="Daily capacity (orders)">
            <input type="number" min={0} value={capacity} onChange={(event) => setCapacity(event.target.value)} className={fieldClass} style={fieldStyle} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={2000} className={fieldClass} style={fieldStyle} />
        </Field>
        <button
          type="submit"
          disabled={save.isPending}
          className="self-end rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--app-primary)" }}
        >
          {save.isPending ? "Saving…" : node ? "Save changes" : "Add node"}
        </button>
      </form>
    </Modal>
  );
}

function DisableDialog({ node, onClose }: { node: FulfillmentNode; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const disable = useMutation({
    mutationFn: () => disableFulfillmentNode(node.id, reason.trim()),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fulfillment-nodes"] }),
        queryClient.invalidateQueries({ queryKey: ["fulfillment-coverage"] }),
      ]);
      toast.success(`${node.name} disabled. Its products no longer count as covered by it.`);
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't disable this node.")),
  });
  return (
    <Modal title={`Disable ${node.name}?`} onClose={onClose}>
      <p className="mt-0 text-sm" style={{ color: "var(--app-text-muted)" }}>
        {node.mappedProducts} product mapping{node.mappedProducts === 1 ? "" : "s"} stay saved, but this node stops counting
        as an available source{node.primaryFor ? ` — ${node.primaryFor} product${node.primaryFor === 1 ? "" : "s"} will lose their active primary` : ""}.
      </p>
      <Field label="Reason (kept in the audit log)">
        <input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} className={fieldClass} style={fieldStyle} />
      </Field>
      <button
        type="button"
        onClick={() => disable.mutate()}
        disabled={disable.isPending || reason.trim().length < 3}
        className="mt-4 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: "var(--app-danger-strong)" }}
      >
        {disable.isPending ? "Disabling…" : "Disable node"}
      </button>
    </Modal>
  );
}

function CoverageRow({ row, nodes }: { row: FulfillmentCoverageRow; nodes: FulfillmentNode[] }) {
  const queryClient = useQueryClient();
  const mappedNodeIds = new Set(row.mappings.map((mapping) => mapping.node.id));
  const available = nodes.filter((node) => node.status === "active" && !mappedNodeIds.has(node.id));
  const [nodeId, setNodeId] = useState("");
  const [role, setRole] = useState<FulfillmentMappingRole>(row.mappings.some((m) => m.role === "primary") ? "backup" : "primary");

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["fulfillment-coverage"] }),
      queryClient.invalidateQueries({ queryKey: ["fulfillment-nodes"] }),
    ]);
  const add = useMutation({
    mutationFn: () => setFulfillmentMapping({ nodeId, productId: row.productId, role }),
    onSuccess: async () => {
      await refresh();
      setNodeId("");
      toast.success(role === "primary" ? "Primary source set. Any previous primary is now a backup." : "Backup source added.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't map this product.")),
  });
  const promote = useMutation({
    mutationFn: (targetNodeId: string) => setFulfillmentMapping({ nodeId: targetNodeId, productId: row.productId, role: "primary" }),
    onSuccess: async () => {
      await refresh();
      toast.success("Primary source changed.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't change the primary source.")),
  });
  const remove = useMutation({
    mutationFn: removeFulfillmentMapping,
    onSuccess: async () => {
      await refresh();
      toast.success("Mapping removed.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't remove this mapping.")),
  });

  return (
    <tr className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
      <td className="px-4 py-3">
        <p className="m-0 font-semibold" style={{ color: "var(--app-text)" }}>{row.name}</p>
        <p className="m-0 mt-0.5" style={{ color: "var(--app-text-faintest)" }}>
          SKU {row.sku ?? "—"} · {row.stockQty} in this branch
        </p>
      </td>
      <td className="px-4 py-3">
        <span className="inline-block rounded-full border px-2 py-0.5 font-semibold" style={coverageStyle(row.coverage)}>
          {COVERAGE_LABEL[row.coverage]}
        </span>
      </td>
      <td className="px-4 py-3">
        {row.mappings.length === 0 ? (
          <span style={{ color: "var(--app-text-faintest)" }}>Not mapped to any node</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {row.mappings.map((mapping) => (
              <span
                key={mapping.id}
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-surface-2)",
                  color: mapping.node.status === "disabled" ? "var(--app-text-disabled)" : "var(--app-text-muted)",
                  textDecoration: mapping.node.status === "disabled" ? "line-through" : undefined,
                }}
              >
                <strong>{mapping.role === "primary" ? "Primary" : "Backup"}</strong> {mapping.node.name}
                {mapping.node.status === "disabled" ? " (disabled)" : ""}
                {mapping.role === "backup" && mapping.node.status === "active" && (
                  <button
                    type="button"
                    onClick={() => promote.mutate(mapping.node.id)}
                    disabled={promote.isPending}
                    className="font-bold underline"
                    style={{ color: "var(--app-primary)" }}
                    aria-label={`Make ${mapping.node.name} the primary source for ${row.name}`}
                  >
                    make primary
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove.mutate(mapping.id)}
                  disabled={remove.isPending}
                  className="font-bold"
                  style={{ color: "var(--app-danger-strong)" }}
                  aria-label={`Remove ${mapping.node.name} from ${row.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {available.length === 0 ? (
          <span style={{ color: "var(--app-text-faintest)" }}>{nodes.length ? "All active nodes mapped" : "Add a node first"}</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={nodeId} onChange={(event) => setNodeId(event.target.value)} aria-label={`Node for ${row.name}`} className="rounded-lg border px-2 py-1.5" style={fieldStyle}>
              <option value="">Choose node</option>
              {available.map((node) => (
                <option key={node.id} value={node.id}>{node.name}</option>
              ))}
            </select>
            <select value={role} onChange={(event) => setRole(event.target.value as FulfillmentMappingRole)} aria-label={`Role for ${row.name}`} className="rounded-lg border px-2 py-1.5" style={fieldStyle}>
              <option value="primary">Primary</option>
              <option value="backup">Backup</option>
            </select>
            <button
              type="button"
              onClick={() => add.mutate()}
              disabled={!nodeId || add.isPending}
              className="rounded-lg px-3 py-1.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--app-primary)" }}
            >
              {add.isPending ? "Saving…" : "Add"}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export function CommerceFulfillmentNetworkView() {
  useModuleHeader({
    title: "Fulfillment Network",
    subtitle: "Define every place that can fulfil your products, and which one is primary or backup for each.",
  });

  const session = useSession();
  const currency = session.business.currency || "USD";
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"nodes" | "coverage">("nodes");
  const [editing, setEditing] = useState<FulfillmentNode | "new" | null>(null);
  const [disabling, setDisabling] = useState<FulfillmentNode | null>(null);
  const [coverageFilter, setCoverageFilter] = useState<FulfillmentCoverage | "all">("all");
  const [search, setSearch] = useState("");

  const nodesQuery = useQuery({ queryKey: ["fulfillment-nodes"], queryFn: fetchFulfillmentNodes });
  const coverageQuery = useQuery({ queryKey: ["fulfillment-coverage"], queryFn: fetchFulfillmentCoverage });
  const enable = useMutation({
    mutationFn: enableFulfillmentNode,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fulfillment-nodes"] }),
        queryClient.invalidateQueries({ queryKey: ["fulfillment-coverage"] }),
      ]);
      toast.success("Node enabled.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't enable this node.")),
  });

  const nodes = nodesQuery.data ?? [];
  const summary = coverageQuery.data?.summary;
  const activeNodes = nodes.filter((node) => node.status === "active");
  const trackedNodes = activeNodes.filter((node) => node.stock.tracked);
  const trackedUnits = trackedNodes.reduce((sum, node) => sum + (node.stock.units ?? 0), 0);
  const loadingValue = (loading: boolean, value: ReactNode) => (loading ? "…" : value);

  const needle = search.trim().toLowerCase();
  const coverageRows = (coverageQuery.data?.products ?? []).filter(
    (row) =>
      (coverageFilter === "all" || row.coverage === coverageFilter) &&
      (!needle || row.name.toLowerCase().includes(needle) || (row.sku ?? "").toLowerCase().includes(needle)),
  );

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p
        className="m-0 rounded-xl border px-4 py-3 text-xs"
        style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}
      >
        Stock stays in Inventory: own-location nodes read their branch&rsquo;s real stock by SKU. Stock at 3PL, dropship,
        print-on-demand and marketplace nodes is not tracked (no connector yet). Capacity use, reliability and on-time
        performance need routed orders, so they appear once the Fulfillment Router is live. Delivery zones and couriers stay in{" "}
        <Link href="/deliveries" className="font-bold underline">Delivery &amp; Riders</Link>.
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Active nodes" value={loadingValue(nodesQuery.isLoading, activeNodes.length)} hint={`${nodes.length - activeNodes.length} disabled`} />
        <Kpi
          label="Units at own locations"
          value={loadingValue(nodesQuery.isLoading, trackedNodes.length ? trackedUnits : "—")}
          hint={trackedNodes.length ? "Mapped products, live branch stock" : "No own-location node yet"}
        />
        <Kpi label="Products with active primary" value={loadingValue(coverageQuery.isLoading, summary ? summary.covered + summary.noBackup : "—")} hint={summary ? `of ${summary.activeProducts} active physical products` : "—"} />
        <Kpi label="No backup source" value={loadingValue(coverageQuery.isLoading, summary?.noBackup ?? "—")} hint="Single point of failure" tone={summary?.noBackup ? "warning" : undefined} />
        <Kpi label="Primary disabled" value={loadingValue(coverageQuery.isLoading, summary?.primaryUnavailable ?? "—")} hint="Only a backup is active" tone={summary?.primaryUnavailable ? "warning" : undefined} />
        <Kpi label="Coverage gaps" value={loadingValue(coverageQuery.isLoading, summary?.gaps ?? "—")} hint="No active node at all" tone={summary?.gaps ? "danger" : undefined} />
      </section>

      <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 pt-3" style={{ borderColor: "var(--app-border)" }}>
          <div role="tablist" className="flex gap-4">
            {(
              [
                ["nodes", `Nodes (${nodes.length})`],
                ["coverage", `Product coverage (${summary?.activeProducts ?? 0})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className="border-b-2 pb-2.5 text-sm font-bold"
                style={{
                  borderColor: tab === key ? "var(--app-primary)" : "transparent",
                  color: tab === key ? "var(--app-text)" : "var(--app-text-faint)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="mb-2.5 rounded-lg px-3 py-2 text-xs font-bold text-white"
            style={{ background: "var(--app-primary)" }}
          >
            Add node
          </button>
        </div>

        {tab === "nodes" ? (
          nodesQuery.isLoading ? (
            <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading fulfilment nodes…</p>
          ) : nodesQuery.isError ? (
            <div className="flex flex-wrap items-center gap-3 p-6 text-sm" style={{ color: "var(--app-danger-strong)" }}>
              {errorMessage(nodesQuery.error, "Couldn't load fulfilment nodes.")}
              <button type="button" onClick={() => nodesQuery.refetch()} className="font-bold underline">Retry</button>
            </div>
          ) : nodes.length === 0 ? (
            <div className="p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>
              <p className="m-0 font-semibold" style={{ color: "var(--app-text)" }}>No fulfilment nodes yet.</p>
              <p className="mb-0 mt-1">
                Add your own branch or warehouse first, then any 3PL, dropship supplier or manufacturer that ships for you.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead style={{ color: "var(--app-text-faint)", background: "var(--app-surface-2)" }}>
                  <tr>
                    <th className="px-4 py-3 font-semibold">Node</th>
                    <th className="px-4 py-3 font-semibold">Linked to</th>
                    <th className="px-4 py-3 font-semibold">Ships from → serves</th>
                    <th className="px-4 py-3 font-semibold">Processing</th>
                    <th className="px-4 py-3 font-semibold">Cost / capacity</th>
                    <th className="px-4 py-3 font-semibold">Products</th>
                    <th className="px-4 py-3 font-semibold">Stock</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((node) => (
                    <tr key={node.id} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                      <td className="px-4 py-3">
                        <p className="m-0 font-semibold" style={{ color: "var(--app-text)" }}>{node.name}</p>
                        <p className="m-0 mt-0.5" style={{ color: "var(--app-text-faintest)" }}>{TYPE_LABEL[node.type]}</p>
                      </td>
                      <td className="px-4 py-3">
                        {node.branch ? (
                          <span>
                            Branch: {node.branch.name ?? "Unknown branch"}
                            {node.branch.active ? "" : " (inactive)"}
                          </span>
                        ) : node.supplier ? (
                          <span>Supplier: {node.supplier.name}</span>
                        ) : (
                          <span style={{ color: "var(--app-text-faintest)" }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {node.country ?? "—"} →{" "}
                        {node.serviceMarkets.length ? node.serviceMarkets.join(", ") : <span style={{ color: "var(--app-warning-text)" }}>markets not set</span>}
                      </td>
                      <td className="px-4 py-3">
                        {node.processingDays === null ? "Not set" : `${node.processingDays} day${node.processingDays === 1 ? "" : "s"}`}
                        {node.cutoffTime ? ` · cutoff ${node.cutoffTime}` : ""}
                      </td>
                      <td className="px-4 py-3">
                        {node.costPerOrder === null ? "Cost not set" : `${money(node.costPerOrder, currency)} / order`}
                        <br />
                        <span style={{ color: "var(--app-text-faintest)" }}>
                          {node.dailyCapacity === null ? "Capacity not set" : `${node.dailyCapacity} orders / day`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {node.primaryFor} primary · {node.backupFor} backup
                      </td>
                      <td className="px-4 py-3">
                        {node.stock.tracked ? (
                          <span>
                            {node.stock.units} units
                            {node.stock.skusMissing > 0 && (
                              <span className="block" style={{ color: "var(--app-warning-text)" }}>
                                {node.stock.skusMissing} mapped product{node.stock.skusMissing === 1 ? "" : "s"} missing in this branch (by SKU)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: "var(--app-text-faintest)" }}>Not tracked</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {node.status === "active" ? (
                          <span style={{ color: "var(--app-success-text)" }}>Active</span>
                        ) : (
                          <span style={{ color: "var(--app-danger-strong)" }}>
                            Disabled
                            {node.disabledReason && <span className="block" style={{ color: "var(--app-text-faint)" }}>{node.disabledReason}</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setEditing(node)} className="font-bold underline">Edit</button>
                          {node.status === "active" ? (
                            <button type="button" onClick={() => setDisabling(node)} className="font-bold underline" style={{ color: "var(--app-danger-strong)" }}>
                              Disable
                            </button>
                          ) : (
                            <button type="button" onClick={() => enable.mutate(node.id)} disabled={enable.isPending} className="font-bold underline" style={{ color: "var(--app-success-text)" }}>
                              Enable
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
        ) : coverageQuery.isLoading ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading product coverage…</p>
        ) : coverageQuery.isError ? (
          <div className="flex flex-wrap items-center gap-3 p-6 text-sm" style={{ color: "var(--app-danger-strong)" }}>
            {errorMessage(coverageQuery.error, "Couldn't load product coverage.")}
            <button type="button" onClick={() => coverageQuery.refetch()} className="font-bold underline">Retry</button>
          </div>
        ) : summary?.activeProducts === 0 ? (
          <div className="p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>
            No active physical products yet. Add products in <Link href="/products" className="font-bold underline">Products</Link> — services
            don&rsquo;t need fulfilment.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b p-4" style={{ borderColor: "var(--app-border)" }}>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search product or SKU"
                aria-label="Search products"
                className="min-w-[200px] flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]"
                style={fieldStyle}
              />
              <select
                value={coverageFilter}
                onChange={(event) => setCoverageFilter(event.target.value as FulfillmentCoverage | "all")}
                aria-label="Filter by coverage"
                className="rounded-lg border px-3 py-2 text-sm"
                style={fieldStyle}
              >
                <option value="all">All coverage states</option>
                {(Object.keys(COVERAGE_LABEL) as FulfillmentCoverage[]).map((key) => (
                  <option key={key} value={key}>{COVERAGE_LABEL[key]}</option>
                ))}
              </select>
            </div>
            {coverageRows.length === 0 ? (
              <div className="flex flex-wrap items-center gap-3 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>
                No products match these filters.
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setCoverageFilter("all");
                  }}
                  className="font-bold underline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead style={{ color: "var(--app-text-faint)", background: "var(--app-surface-2)" }}>
                    <tr>
                      <th className="px-4 py-3 font-semibold">Product</th>
                      <th className="px-4 py-3 font-semibold">Coverage</th>
                      <th className="px-4 py-3 font-semibold">Sources</th>
                      <th className="px-4 py-3 font-semibold">Add source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverageRows.map((row) => (
                      <CoverageRow key={row.productId} row={row} nodes={nodes} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {editing && <NodeDialog node={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {disabling && <DisableDialog node={disabling} onClose={() => setDisabling(null)} />}
    </main>
  );
}
