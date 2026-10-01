"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useModuleHeader } from "@/components/layout/module-header-context";
import {
  fetchStoreOpportunities,
  fetchStoreSummary,
  runStoreChecks,
  setStoreOpportunityStatus,
  type StoreOpportunity,
  type StoreOpportunityStatus,
  type StoreRuleKey,
} from "@/lib/commerce-store-optimizer-api";

const RULE: Record<StoreRuleKey, { label: string; fix: string; href: string }> = {
  missing_photo: { label: "Missing photo", fix: "Add a photo in Products", href: "/products" },
  missing_category: { label: "No category", fix: "Assign a category in Products", href: "/products/categories" },
  high_return_rate: { label: "High returns", fix: "Review return reasons, then clarify sizing/description in the Listing Builder", href: "/orders/returns" },
  out_of_stock_demand: { label: "Out of stock, in demand", fix: "Restock through Inventory → Purchases", href: "/inventory/purchases" },
  below_cost_price: { label: "Below cost", fix: "Check pricing in Products", href: "/products" },
  listing_not_synced: { label: "Approved, not sent", fix: "Send it from Channel Listings", href: "/autonomous-commerce/channel-listings" },
};

const STATUS_LABEL: Record<StoreOpportunityStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Marked done",
  verified: "Verified fixed",
  dismissed: "Dismissed",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone?: "warning" | "danger" | "good" }) {
  const color =
    tone === "danger" ? "var(--app-danger-strong)" : tone === "warning" ? "var(--app-warning-text)" : tone === "good" ? "var(--app-success-text)" : "var(--app-text)";
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="m-0 mt-1 text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>{hint}</p>
    </div>
  );
}

function Row({ row }: { row: StoreOpportunity }) {
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: ({ status, reason }: { status: StoreOpportunityStatus; reason?: string }) => setStoreOpportunityStatus(row.id, status, reason),
    onSuccess: async () => {
      await Promise.all(["store-summary", "store-opportunities"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't update this opportunity.")),
  });
  const rule = RULE[row.ruleKey];
  const impactColor = row.impact === "high" ? "var(--app-danger-strong)" : row.impact === "medium" ? "var(--app-warning-text)" : "var(--app-text-faint)";
  return (
    <tr className="border-t align-top" style={{ borderColor: "var(--app-border)", opacity: row.status === "dismissed" ? 0.55 : 1 }}>
      <td className="px-4 py-3">
        <p className="m-0 font-semibold" style={{ color: "var(--app-text)" }}>{row.title}</p>
        <p className="m-0 mt-0.5" style={{ color: "var(--app-text-faint)" }}>{row.evidence.explanation}</p>
        {row.evidence.topReasons && row.evidence.topReasons.length > 0 && (
          <p className="m-0 mt-0.5" style={{ color: "var(--app-text-faintest)" }}>
            Top return reasons: {row.evidence.topReasons.map((item) => `${item.reason} (${item.units})`).join(", ")}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="font-semibold">{rule.label}</span>
        <span className="block font-semibold" style={{ color: impactColor }}>{row.impact} impact</span>
      </td>
      <td className="px-4 py-3">
        {row.ruleKey === "high_return_rate" && row.baselineValue !== null && row.metricValue !== null ? (
          <span>
            {row.baselineValue}% when found → {row.metricValue}% now
          </span>
        ) : (
          <span style={{ color: "var(--app-text-faintest)" }}>Found {formatDate(row.firstDetectedAt)}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Link href={rule.href} className="font-bold underline">{rule.fix}</Link>
      </td>
      <td className="px-4 py-3">
        <span className="font-semibold" style={{ color: row.status === "verified" ? "var(--app-success-text)" : undefined }}>{STATUS_LABEL[row.status]}</span>
        {row.verifiedAt && <span className="block" style={{ color: "var(--app-text-faintest)" }}>Confirmed by re-check {formatDate(row.verifiedAt)}</span>}
        {row.status === "done" && <span className="block" style={{ color: "var(--app-text-faintest)" }}>Waiting for a re-check to confirm</span>}
        {row.resolution && <span className="block" style={{ color: "var(--app-text-faint)" }}>{row.resolution}</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {row.status === "open" && <button type="button" onClick={() => change.mutate({ status: "in_progress" })} className="font-bold underline">Start</button>}
          {(row.status === "open" || row.status === "in_progress") && (
            <button type="button" onClick={() => change.mutate({ status: "done" })} className="font-bold underline">Mark done</button>
          )}
          {(row.status === "open" || row.status === "in_progress") && (
            <button
              type="button"
              onClick={() => {
                const reason = window.prompt("Why dismiss this opportunity?")?.trim();
                if (reason && reason.length >= 3) change.mutate({ status: "dismissed", reason });
              }}
              className="font-bold underline"
              style={{ color: "var(--app-text-faint)" }}
            >
              Dismiss
            </button>
          )}
          {(row.status === "done" || row.status === "dismissed") && (
            <button type="button" onClick={() => change.mutate({ status: "open" })} className="font-bold underline">Reopen</button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function CommerceStoreOptimizerView() {
  useModuleHeader({
    title: "Store Optimizer",
    subtitle: "Fixable store problems found in your real product, sales, returns and listing data.",
  });
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"active" | "all">("active");
  const summaryQuery = useQuery({ queryKey: ["store-summary"], queryFn: fetchStoreSummary });
  const listQuery = useQuery({ queryKey: ["store-opportunities"], queryFn: fetchStoreOpportunities });
  const run = useMutation({
    mutationFn: runStoreChecks,
    onSuccess: async (result) => {
      await Promise.all(["store-summary", "store-opportunities"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      toast.success(`${result.created} new, ${result.refreshed} still present, ${result.verified} verified fixed.`);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't run the checks.")),
  });
  const summary = summaryQuery.data;
  const rows = (listQuery.data ?? []).filter((row) => filter === "all" || row.status === "open" || row.status === "in_progress" || row.status === "done");
  const loading = summaryQuery.isLoading;

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 rounded-xl border px-4 py-3 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>
        Noxtill doesn&rsquo;t collect storefront traffic, so <strong>conversion rate, page drop-off, search and mobile conversion are not tracked</strong> here.
        These checks use your products, orders, returns, waitlist and listings
        {summary ? ` (sales and returns from the last ${summary.rules.lookbackDays} days; high returns = at least ${summary.rules.highReturnMinUnits} units and ${summary.rules.highReturnRatePct}% of units sold)` : ""}.
        Nothing on your live store is edited — each finding links to where you fix it, and it&rsquo;s marked <em>verified fixed</em> only when a re-check
        shows the problem is gone. Test bigger changes in the Experiment Lab.
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Open" value={loading ? "…" : summary?.openOpportunities ?? "—"} hint="Open or in progress" tone={summary?.openOpportunities ? "warning" : undefined} />
        <Kpi label="High impact" value={loading ? "…" : summary?.highImpactOpen ?? "—"} hint="Open, affecting sold or in-demand products" tone={summary?.highImpactOpen ? "danger" : undefined} />
        <Kpi label="Marked done" value={loading ? "…" : summary?.markedDone ?? "—"} hint="Awaiting re-check" />
        <Kpi label="Verified fixed" value={loading ? "…" : summary?.verifiedFixed ?? "—"} hint="Confirmed gone by a re-check" tone="good" />
        <Kpi label="Conversion rate" value="Not tracked" hint="No storefront analytics connected" />
        <div className="flex items-center justify-center">
          <button type="button" onClick={() => run.mutate()} disabled={run.isPending} className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
            {run.isPending ? "Checking…" : "Run checks"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div role="tablist" className="flex gap-4 border-b px-4 pt-3" style={{ borderColor: "var(--app-border)" }}>
          {([["active", "To do"], ["all", "All, incl. verified & dismissed"]] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className="border-b-2 pb-2.5 text-sm font-bold" style={{ borderColor: filter === key ? "var(--app-primary)" : "transparent", color: filter === key ? "var(--app-text)" : "var(--app-text-faint)" }}>
              {label}
            </button>
          ))}
        </div>
        {listQuery.isLoading ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading opportunities…</p>
        ) : listQuery.isError ? (
          <div className="flex flex-wrap items-center gap-3 p-6 text-sm" style={{ color: "var(--app-danger-strong)" }}>
            {errorMessage(listQuery.error, "Couldn't load opportunities.")}
            <button type="button" onClick={() => listQuery.refetch()} className="font-bold underline">Retry</button>
          </div>
        ) : (listQuery.data ?? []).length === 0 ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>No checks have run yet. Press &ldquo;Run checks&rdquo; to scan your products and sales.</p>
        ) : rows.length === 0 ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Nothing to do right now.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)", background: "var(--app-surface-2)" }}>
                <tr>
                  <th className="px-4 py-3 font-semibold">Finding &amp; evidence</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Measure</th>
                  <th className="px-4 py-3 font-semibold">How to fix</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => <Row key={row.id} row={row} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
