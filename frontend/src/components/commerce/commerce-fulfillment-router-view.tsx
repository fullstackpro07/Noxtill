"use client";

import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useModuleHeader } from "@/components/layout/module-header-context";
import {
  assignRoute,
  cancelRoute,
  fetchRouteHistory,
  fetchRouterCandidates,
  fetchRouterQueue,
  type MarketCheck,
  type RouterQueueRow,
  type StockCheck,
} from "@/lib/commerce-router-api";

type QueueFilter = "awaiting" | "routed" | "all";

const STOCK_LABEL: Record<StockCheck, string> = {
  available: "In stock at branch",
  insufficient: "Not enough branch stock",
  not_in_branch: "SKU not in branch",
  not_tracked: "Stock not tracked",
};

const MARKET_LABEL: Record<MarketCheck, string> = {
  served: "Serves destination",
  not_served: "Doesn't serve destination",
  not_configured: "Markets not configured",
  unknown: "Destination not given",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

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

function RouteReview({ row, onClose }: { row: RouterQueueRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [country, setCountry] = useState(row.route?.destinationCountry ?? "");
  const validCountry = /^[A-Za-z]{2}$/.test(country.trim()) ? country.trim().toUpperCase() : undefined;
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const candidatesQuery = useQuery({
    queryKey: ["router-candidates", row.orderId, validCountry ?? ""],
    queryFn: () => fetchRouterCandidates(row.orderId, validCountry),
  });
  const historyQuery = useQuery({
    queryKey: ["router-history", row.orderId],
    queryFn: () => fetchRouteHistory(row.orderId),
  });
  const data = candidatesQuery.data;
  const recommended = useMemo(
    () => Object.fromEntries((data?.recommendation?.allocations ?? []).map((a) => [a.orderItemId, a.nodeId])),
    [data],
  );
  const current = useMemo(
    () => Object.fromEntries((row.route?.allocations ?? []).map((a) => [a.orderItemId, a.node.id])),
    [row.route],
  );
  // Explicit choice → current route → recommendation.
  const selected = (lineId: string) => choices[lineId] ?? current[lineId] ?? recommended[lineId] ?? "";
  const lines = data?.lines ?? row.lines;
  const allChosen = lines.every((line) => selected(line.orderItemId));
  const overrides = lines.some((line) => selected(line.orderItemId) !== recommended[line.orderItemId]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["router-queue"] }),
      queryClient.invalidateQueries({ queryKey: ["router-history", row.orderId] }),
    ]);
  const assign = useMutation({
    mutationFn: () =>
      assignRoute(row.orderId, {
        destinationCountry: validCountry,
        allocations: lines.map((line) => ({ orderItemId: line.orderItemId, nodeId: selected(line.orderItemId) })),
        reason: reason.trim() || undefined,
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Route recorded. Stock isn't reserved and the order status is unchanged.");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't record this route.")),
  });
  const cancel = useMutation({
    mutationFn: () => cancelRoute(row.route!.decisionId, cancelReason.trim()),
    onSuccess: async () => {
      await refresh();
      toast.success("Route cancelled. The order is back in the routing queue.");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't cancel this route.")),
  });

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
        aria-label={`Route order #${row.orderNo}`}
        className="my-auto max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border p-5 shadow-xl"
        style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-base font-bold">Route order #{row.orderNo}</h2>
            <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>
              {row.customer?.name ?? "No customer"} · {row.orderType}
              {row.deliveryAddress ? ` · ${row.deliveryAddress}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm font-semibold" style={{ color: "var(--app-text-faint)" }}>
            Close
          </button>
        </div>

        <label className="flex max-w-xs flex-col gap-1 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>
          Destination country
          <input
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            maxLength={2}
            placeholder="e.g. US"
            className="rounded-lg border px-3 py-2 text-sm"
            style={fieldStyle}
          />
          <span className="font-normal" style={{ color: "var(--app-text-faintest)" }}>
            Orders don&rsquo;t store a structured destination, so enter it to check which nodes serve that market.
          </span>
        </label>

        {candidatesQuery.isLoading ? (
          <p className="text-sm" style={{ color: "var(--app-text-faint)" }}>Evaluating fulfilment nodes…</p>
        ) : candidatesQuery.isError ? (
          <p className="text-sm" style={{ color: "var(--app-danger-strong)" }}>
            {errorMessage(candidatesQuery.error, "Couldn't evaluate this order.")}
          </p>
        ) : data ? (
          <>
            <div
              className="mt-4 rounded-xl border p-3 text-xs"
              style={{
                borderColor: data.recommendation ? "var(--app-success-border)" : "var(--app-warning-border)",
                background: data.recommendation ? "var(--app-success-bg)" : "var(--app-warning-bg)",
              }}
            >
              {data.recommendation ? (
                <>
                  <strong>Recommended: {data.recommendation.mode === "split" ? "split shipment" : "single node"}.</strong>{" "}
                  {data.recommendation.why.join(". ")}.
                </>
              ) : (
                <>
                  <strong>No eligible route.</strong> At least one line has no active node that can fulfil it. Map the product
                  in <Link href="/autonomous-commerce/fulfillment-network" className="font-bold underline">Fulfillment Network</Link>{" "}
                  or check branch stock.
                </>
              )}
              <span className="block" style={{ color: "var(--app-text-faintest)" }}>
                Ranking policy {data.policyVersion}: primary mapping, verified stock, market, processing time, then cost.
              </span>
            </div>

            <h3 className="mb-2 mt-5 text-sm font-bold">Allocate each line</h3>
            <div className="flex flex-col gap-2">
              {lines.map((line) => {
                const options = data.nodes.filter((node) =>
                  node.lines.some((check) => check.orderItemId === line.orderItemId && check.eligible),
                );
                return (
                  <div key={line.orderItemId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--app-border)" }}>
                    <span>
                      <strong>{line.name}</strong> × {line.qty}
                      <span style={{ color: "var(--app-text-faintest)" }}> · SKU {line.sku ?? "—"}</span>
                    </span>
                    {options.length === 0 ? (
                      <span style={{ color: "var(--app-danger-strong)" }}>No eligible node</span>
                    ) : (
                      <select
                        value={selected(line.orderItemId)}
                        onChange={(event) => setChoices((prev) => ({ ...prev, [line.orderItemId]: event.target.value }))}
                        aria-label={`Node for ${line.name}`}
                        className="rounded-lg border px-2 py-1.5"
                        style={fieldStyle}
                      >
                        <option value="">Choose node</option>
                        {options.map((node) => {
                          const check = node.lines.find((item) => item.orderItemId === line.orderItemId)!;
                          return (
                            <option key={node.nodeId} value={node.nodeId}>
                              {node.name} · {check.role === "primary" ? "primary" : "backup"} · {STOCK_LABEL[check.stock].toLowerCase()}
                              {recommended[line.orderItemId] === node.nodeId ? " (recommended)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>

            <h3 className="mb-2 mt-5 text-sm font-bold">Why each node is or isn&rsquo;t eligible</h3>
            {data.nodes.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--app-text-faint)" }}>
                No active fulfilment nodes. Add one in{" "}
                <Link href="/autonomous-commerce/fulfillment-network" className="font-bold underline">Fulfillment Network</Link>.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead style={{ color: "var(--app-text-faint)", background: "var(--app-surface-2)" }}>
                    <tr>
                      <th className="px-3 py-2 font-semibold">Node</th>
                      <th className="px-3 py-2 font-semibold">Market</th>
                      {lines.map((line) => (
                        <th key={line.orderItemId} className="px-3 py-2 font-semibold">{line.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.nodes.map((node) => (
                      <tr key={node.nodeId} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                        <td className="px-3 py-2">
                          <strong>{node.name}</strong>
                          <span className="block" style={{ color: "var(--app-text-faintest)" }}>
                            {node.processingDays === null ? "processing not set" : `${node.processingDays}d processing`}
                          </span>
                        </td>
                        <td className="px-3 py-2" style={{ color: node.market === "not_served" ? "var(--app-danger-strong)" : "var(--app-text-muted)" }}>
                          {MARKET_LABEL[node.market]}
                        </td>
                        {node.lines.map((check) => (
                          <td key={check.orderItemId} className="px-3 py-2">
                            {check.eligible ? (
                              <span style={{ color: "var(--app-success-text)" }}>
                                Eligible · {check.role}
                                <span className="block" style={{ color: "var(--app-text-faintest)" }}>{STOCK_LABEL[check.stock]}</span>
                              </span>
                            ) : (
                              <span style={{ color: "var(--app-danger-strong)" }}>{check.reasons.join("; ")}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {overrides && allChosen && (
              <label className="mt-4 flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>
                Reason for choosing a different route than recommended
                <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="rounded-lg border px-3 py-2 text-sm" style={fieldStyle} />
              </label>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => assign.mutate()}
                disabled={assign.isPending || !allChosen || (overrides && reason.trim().length < 3)}
                className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: "var(--app-primary)" }}
              >
                {assign.isPending ? "Saving…" : row.route ? "Reroute order" : "Approve route"}
              </button>
            </div>
          </>
        ) : null}

        {row.route && (
          <div className="mt-5 flex flex-wrap items-end gap-2 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
            <label className="flex flex-1 flex-col gap-1 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>
              Cancel the current route — reason
              <input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={500} className="rounded-lg border px-3 py-2 text-sm" style={fieldStyle} />
            </label>
            <button
              type="button"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending || cancelReason.trim().length < 3}
              className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--app-danger-strong)" }}
            >
              {cancel.isPending ? "Cancelling…" : "Cancel route"}
            </button>
          </div>
        )}

        <h3 className="mb-2 mt-5 text-sm font-bold">Route history</h3>
        {historyQuery.isLoading ? (
          <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
        ) : (historyQuery.data ?? []).length === 0 ? (
          <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>No routes recorded for this order yet.</p>
        ) : (
          <ul className="m-0 flex flex-col gap-1 pl-5 text-xs">
            {(historyQuery.data ?? []).map((entry) => (
              <li key={entry.id}>
                {formatDate(entry.createdAt)} · {entry.status} · {entry.mode} ·{" "}
                {[...new Set(entry.allocations.map((a) => a.node.name))].join(", ")}
                {entry.overrodeRecommendation ? ` · override: ${entry.reason ?? "no reason"}` : ""}
                {entry.endedReason ? ` · ended: ${entry.endedReason}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function CommerceFulfillmentRouterView() {
  useModuleHeader({
    title: "Fulfillment Router",
    subtitle: "Choose which fulfilment node ships each open online or delivery order, with the evidence for every choice.",
  });

  const [filter, setFilter] = useState<QueueFilter>("awaiting");
  const [reviewing, setReviewing] = useState<RouterQueueRow | null>(null);
  const queueQuery = useQuery({ queryKey: ["router-queue"], queryFn: fetchRouterQueue });
  const rows = queueQuery.data ?? [];
  const awaiting = rows.filter((row) => !row.route);
  const routed = rows.filter((row) => row.route);
  const visible = filter === "awaiting" ? awaiting : filter === "routed" ? routed : rows;
  const loading = queueQuery.isLoading;

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p
        className="m-0 rounded-xl border px-4 py-3 text-xs"
        style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}
      >
        Every route needs your approval — nothing is auto-routed. A route records which node ships each line; it doesn&rsquo;t
        reserve stock (stock is deducted when the order is created), change the order&rsquo;s status or send anything to a
        3PL or supplier. Delivery promise dates aren&rsquo;t tracked yet, so promise-at-risk alerts aren&rsquo;t shown. Tracking and
        last-mile stay in <Link href="/deliveries" className="font-bold underline">Delivery &amp; Riders</Link>.
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Awaiting route" value={loading ? "…" : awaiting.length} hint="Open online & delivery orders" tone={awaiting.length ? "warning" : undefined} />
        <Kpi label="No eligible route" value={loading ? "…" : awaiting.filter((row) => row.unroutable).length} hint="A line has no active node" tone={awaiting.some((row) => row.unroutable) ? "danger" : undefined} />
        <Kpi label="Routed" value={loading ? "…" : routed.length} hint="Open orders with an approved route" />
        <Kpi label="Split shipments" value={loading ? "…" : routed.filter((row) => row.route?.mode === "split").length} hint="Routed across more than one node" />
        <Kpi label="Manual overrides" value={loading ? "…" : routed.filter((row) => row.route?.overrodeRecommendation).length} hint="Differ from the recommendation" />
      </section>

      <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div role="tablist" className="flex gap-4 border-b px-4 pt-3" style={{ borderColor: "var(--app-border)" }}>
          {(
            [
              ["awaiting", `Awaiting route (${awaiting.length})`],
              ["routed", `Routed (${routed.length})`],
              ["all", `All open (${rows.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className="border-b-2 pb-2.5 text-sm font-bold"
              style={{
                borderColor: filter === key ? "var(--app-primary)" : "transparent",
                color: filter === key ? "var(--app-text)" : "var(--app-text-faint)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading routing queue…</p>
        ) : queueQuery.isError ? (
          <div className="flex flex-wrap items-center gap-3 p-6 text-sm" style={{ color: "var(--app-danger-strong)" }}>
            {errorMessage(queueQuery.error, "Couldn't load the routing queue.")}
            <button type="button" onClick={() => queueQuery.refetch()} className="font-bold underline">Retry</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>
            <p className="m-0 font-semibold" style={{ color: "var(--app-text)" }}>No open online or delivery orders with physical products.</p>
            <p className="mb-0 mt-1">
              Orders appear here when they&rsquo;re pending, confirmed or in progress. Set up your nodes in{" "}
              <Link href="/autonomous-commerce/fulfillment-network" className="font-bold underline">Fulfillment Network</Link> first.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>
            {filter === "awaiting" ? "Every open order has a route." : "No routed orders yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)", background: "var(--app-surface-2)" }}>
                <tr>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Products</th>
                  <th className="px-4 py-3 font-semibold">Route</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.orderId} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                    <td className="px-4 py-3">
                      <p className="m-0 font-semibold">#{row.orderNo}</p>
                      <p className="m-0 mt-0.5" style={{ color: "var(--app-text-faintest)" }}>
                        {row.orderType} · {row.status}
                        {row.externalProvider ? ` · from ${row.externalProvider}` : ""} · {formatDate(row.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3">{row.customer?.name ?? <span style={{ color: "var(--app-text-faintest)" }}>—</span>}</td>
                    <td className="px-4 py-3">
                      {row.lines.map((line) => (
                        <span key={line.orderItemId} className="block">
                          {line.name} × {line.qty}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-3">
                      {row.route ? (
                        <span>
                          <strong>{row.route.mode === "split" ? "Split" : "Single"}:</strong>{" "}
                          {[...new Set(row.route.allocations.map((a) => a.node.name))].join(", ")}
                          {row.route.overrodeRecommendation && (
                            <span className="block" style={{ color: "var(--app-warning-text)" }}>Manual override</span>
                          )}
                        </span>
                      ) : row.unroutable ? (
                        <span style={{ color: "var(--app-danger-strong)" }}>No eligible node for every line</span>
                      ) : row.recommendation ? (
                        <span style={{ color: "var(--app-text-muted)" }}>
                          Suggested {row.recommendation.mode === "split" ? "split" : "single node"} — review to approve
                        </span>
                      ) : (
                        <span style={{ color: "var(--app-text-faintest)" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setReviewing(row)}
                        className="rounded-lg px-3 py-1.5 font-bold text-white"
                        style={{ background: "var(--app-primary)" }}
                      >
                        {row.route ? "View / reroute" : "Review route"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {reviewing && <RouteReview row={reviewing} onClose={() => setReviewing(null)} />}
    </main>
  );
}
