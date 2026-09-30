"use client";

import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchIntegrations } from "@/lib/integrations-api";
import type { ConnectorStatus } from "@/lib/integrations";
import {
  fetchCommerceChannelListings,
  fetchCommerceListingDrafts,
  syncCommerceListingDraft,
  type CommerceChannelListing,
} from "@/lib/commerce-listing-builder-api";

type SyncProvider = "shopify" | "woocommerce";
type HealthFilter = "all" | "current" | "out_of_sync" | "failed" | "pending";

const PROVIDERS: Array<{ key: SyncProvider; label: string }> = [
  { key: "shopify", label: "Shopify" },
  { key: "woocommerce", label: "WooCommerce" },
];

const PROVIDER_LABEL: Record<SyncProvider, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
};

const CONNECTION_LABEL: Record<ConnectorStatus, string> = {
  connected: "Connected",
  needs_attention: "Needs attention",
  not_connected: "Not connected",
};

function isSyncProvider(value: string): value is SyncProvider {
  return value === "shopify" || value === "woocommerce";
}

function health(listing: CommerceChannelListing): Exclude<HealthFilter, "all"> {
  if (listing.status === "failed") return "failed";
  if (listing.status === "pending") return "pending";
  return listing.outOfDate || listing.priceOutOfDate ? "out_of_sync" : "current";
}

const HEALTH_LABEL: Record<Exclude<HealthFilter, "all">, string> = {
  current: "Synced · current",
  out_of_sync: "Out of sync",
  failed: "Sync failed",
  pending: "Sync pending",
};

function healthColors(value: Exclude<HealthFilter, "all">) {
  if (value === "current") {
    return { color: "var(--app-success-text)", background: "var(--app-success-bg)", borderColor: "var(--app-success-border)" };
  }
  if (value === "failed") {
    return { color: "var(--app-danger-strong)", background: "var(--app-surface-2)", borderColor: "var(--app-border)" };
  }
  return { color: "var(--app-warning-text)", background: "var(--app-warning-bg)", borderColor: "var(--app-warning-border)" };
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone?: "warning" | "danger" }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p
        className="m-0 mt-1 text-2xl font-bold"
        style={{
          color:
            tone === "danger" ? "var(--app-danger-strong)" : tone === "warning" ? "var(--app-warning-text)" : "var(--app-text)",
        }}
      >
        {value}
      </p>
      <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>{hint}</p>
    </div>
  );
}

export function CommerceChannelListingsView() {
  useModuleHeader({
    title: "Channel Listings",
    subtitle: "Track every approved listing sent to a connected store, and fix the ones that failed or drifted.",
  });

  const session = useSession();
  const currency = session.business.currency || "USD";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState<SyncProvider | "all">("all");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");

  const listingsQuery = useQuery({
    queryKey: ["commerce-channel-listings"],
    queryFn: fetchCommerceChannelListings,
  });
  const approvedDraftsQuery = useQuery({
    queryKey: ["commerce-listing-drafts", "", "approved"],
    queryFn: () => fetchCommerceListingDrafts({ status: "approved" }),
  });
  const integrationsQuery = useQuery({
    queryKey: ["integrations"],
    queryFn: fetchIntegrations,
  });

  const sync = useMutation({
    mutationFn: ({ draftId, target }: { draftId: string; target: SyncProvider }) =>
      syncCommerceListingDraft(draftId, target),
    onSuccess: async (_result, { target }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commerce-channel-listings"] }),
        queryClient.invalidateQueries({ queryKey: ["commerce-listing-drafts"] }),
      ]);
      toast.success(
        `${PROVIDER_LABEL[target]} confirmed the update. New products stay draft; existing publication status is unchanged.`,
      );
    },
    onError: (error) => toast.error(errorMessage(error, "The store did not confirm this sync.")),
  });

  const listings = useMemo(() => listingsQuery.data ?? [], [listingsQuery.data]);
  const counts = useMemo(() => {
    const result = { current: 0, out_of_sync: 0, failed: 0, pending: 0 };
    for (const listing of listings) result[health(listing)] += 1;
    return result;
  }, [listings]);

  // Approved drafts for a syncable channel that have never been sent to that store.
  const syncedKeys = useMemo(
    () => new Set(listings.map((listing) => `${listing.draftId}:${listing.provider}`)),
    [listings],
  );
  const approvedDrafts = approvedDraftsQuery.data ?? [];
  const notYetSynced = approvedDrafts.filter((draft) => {
    const channel = draft.channel.trim().toLowerCase();
    return isSyncProvider(channel) && !syncedKeys.has(`${draft.id}:${channel}`);
  });
  const unsupportedChannel = approvedDrafts.filter(
    (draft) => !isSyncProvider(draft.channel.trim().toLowerCase()),
  );

  const needle = search.trim().toLowerCase();
  const visible = listings.filter((listing) => {
    if (provider !== "all" && listing.provider !== provider) return false;
    if (healthFilter !== "all" && health(listing) !== healthFilter) return false;
    if (!needle) return true;
    return [listing.product.name, listing.product.sku ?? "", listing.externalProductId ?? "", listing.market ?? ""]
      .some((value) => value.toLowerCase().includes(needle));
  });
  const filtersActive = provider !== "all" || healthFilter !== "all" || needle.length > 0;

  const connections = integrationsQuery.data;
  const syncingId = sync.isPending ? sync.variables?.draftId : null;

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <section
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
        style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold" style={{ color: "var(--app-text-faint)" }}>Store connections</span>
          {PROVIDERS.map(({ key, label }) => {
            const status: ConnectorStatus | undefined = connections?.[key];
            return (
              <Link
                key={key}
                href={`/integrations/${key}`}
                className="rounded-full border px-3 py-1 text-xs font-semibold"
                style={{
                  borderColor: status === "connected" ? "var(--app-success-border)" : "var(--app-border)",
                  background: status === "connected" ? "var(--app-success-bg)" : "var(--app-surface-2)",
                  color:
                    status === "connected"
                      ? "var(--app-success-text)"
                      : status === "needs_attention"
                        ? "var(--app-warning-text)"
                        : "var(--app-text-faint)",
                }}
              >
                {label}: {integrationsQuery.isLoading ? "checking…" : integrationsQuery.isError ? "unknown" : CONNECTION_LABEL[status ?? "not_connected"]}
              </Link>
            );
          })}
        </div>
        <Link
          href="/autonomous-commerce/listing-builder"
          className="rounded-lg px-3 py-2 text-xs font-bold text-white"
          style={{ background: "var(--app-primary)" }}
        >
          Open Listing Builder
        </Link>
      </section>

      <p
        className="m-0 rounded-xl border px-4 py-3 text-xs"
        style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}
      >
        Noxtill sends approved listings to Shopify and WooCommerce as unpublished drafts. Publishing, pausing and
        unpublishing happen in your store admin — Noxtill never changes publication status. &ldquo;Out of sync&rdquo;
        means a newer content version or a changed canonical price hasn&rsquo;t been sent yet; edits made directly in
        the store are not detected.
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Synced & current" value={listingsQuery.isLoading ? "…" : counts.current} hint="Store has the latest approved version and price" />
        <Kpi label="Out of sync" value={listingsQuery.isLoading ? "…" : counts.out_of_sync} hint="Newer content or price not sent yet" tone={counts.out_of_sync ? "warning" : undefined} />
        <Kpi label="Sync failed" value={listingsQuery.isLoading ? "…" : counts.failed} hint="Store did not confirm the last attempt" tone={counts.failed ? "danger" : undefined} />
        <Kpi label="Pending" value={listingsQuery.isLoading ? "…" : counts.pending} hint="Sent, waiting for store confirmation" />
        <Kpi
          label="Approved, never synced"
          value={approvedDraftsQuery.isLoading ? "…" : approvedDraftsQuery.isError ? "—" : notYetSynced.length}
          hint="Approved Shopify/WooCommerce content not sent yet"
        />
      </section>

      {(notYetSynced.length > 0 || unsupportedChannel.length > 0) && (
        <section className="rounded-2xl border p-4" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
          <h2 className="m-0 text-sm font-bold">Approved content waiting for a store</h2>
          <ul className="mb-0 mt-3 flex flex-col gap-2 pl-0">
            {notYetSynced.map((draft) => {
              const target = draft.channel.trim().toLowerCase() as SyncProvider;
              const connected = connections?.[target] === "connected";
              return (
                <li
                  key={draft.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: "var(--app-border)", listStyle: "none" }}
                >
                  <span>
                    <strong>{draft.product.name}</strong> · {PROVIDER_LABEL[target]} · version {draft.currentVersion}
                    {draft.market ? ` · ${draft.market}` : ""}
                  </span>
                  {connected ? (
                    <button
                      type="button"
                      onClick={() => sync.mutate({ draftId: draft.id, target })}
                      disabled={sync.isPending}
                      className="rounded-lg px-3 py-1.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: "var(--app-primary)" }}
                    >
                      {syncingId === draft.id ? "Syncing…" : `Send to ${PROVIDER_LABEL[target]}`}
                    </button>
                  ) : (
                    <Link href={`/integrations/${target}`} className="font-bold underline" style={{ color: "var(--app-warning-text)" }}>
                      Connect {PROVIDER_LABEL[target]} first
                    </Link>
                  )}
                </li>
              );
            })}
            {unsupportedChannel.map((draft) => (
              <li
                key={draft.id}
                className="rounded-lg border px-3 py-2 text-xs"
                style={{ borderColor: "var(--app-border)", listStyle: "none", color: "var(--app-text-faint)" }}
              >
                <strong style={{ color: "var(--app-text)" }}>{draft.product.name}</strong> · {draft.channel} — store sync
                is not available for this channel yet (Shopify and WooCommerce only).
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2 border-b p-4" style={{ borderColor: "var(--app-border)" }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search product, SKU, store ID or market"
            aria-label="Search channel listings"
            className="min-w-[220px] flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]"
            style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
          />
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as SyncProvider | "all")}
            aria-label="Filter by store"
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
          >
            <option value="all">All stores</option>
            {PROVIDERS.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={healthFilter}
            onChange={(event) => setHealthFilter(event.target.value as HealthFilter)}
            aria-label="Filter by sync health"
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
          >
            <option value="all">All sync states</option>
            {(Object.keys(HEALTH_LABEL) as Array<Exclude<HealthFilter, "all">>).map((key) => (
              <option key={key} value={key}>{HEALTH_LABEL[key]}</option>
            ))}
          </select>
        </div>

        {listingsQuery.isLoading ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading channel listings…</p>
        ) : listingsQuery.isError ? (
          <div className="flex flex-wrap items-center gap-3 p-6 text-sm" style={{ color: "var(--app-danger-strong)" }}>
            {errorMessage(listingsQuery.error, "Couldn't load channel listings.")}
            <button type="button" onClick={() => listingsQuery.refetch()} className="font-bold underline">Retry</button>
          </div>
        ) : listings.length === 0 ? (
          <div className="p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>
            <p className="m-0 font-semibold" style={{ color: "var(--app-text)" }}>No listings have been sent to a store yet.</p>
            <p className="mb-0 mt-1">
              Create and approve listing content in the{" "}
              <Link href="/autonomous-commerce/listing-builder" className="font-bold underline">Listing Builder</Link>, then send
              it to a connected Shopify or WooCommerce store.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>
            No listings match these filters.
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setProvider("all");
                  setHealthFilter("all");
                }}
                className="font-bold underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)", background: "var(--app-surface-2)" }}>
                <tr>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Store</th>
                  <th className="px-4 py-3 font-semibold">Store product ID</th>
                  <th className="px-4 py-3 font-semibold">Sync state</th>
                  <th className="px-4 py-3 font-semibold">Content</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Last synced</th>
                  <th className="px-4 py-3 font-semibold">Next step</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((listing) => {
                  const state = health(listing);
                  const connected = connections?.[listing.provider] === "connected";
                  const canResync = listing.draftStatus === "approved" && state !== "current";
                  return (
                    <tr key={listing.id} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                      <td className="px-4 py-3">
                        <p className="m-0 font-semibold" style={{ color: "var(--app-text)" }}>{listing.product.name}</p>
                        <p className="m-0 mt-0.5" style={{ color: "var(--app-text-faintest)" }}>
                          SKU {listing.product.sku ?? "—"}
                          {listing.market ? ` · ${listing.market}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3">{PROVIDER_LABEL[listing.provider]}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: "var(--app-text-faint)" }}>
                        {listing.externalProductId ?? "Not assigned"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full border px-2 py-0.5 font-semibold" style={healthColors(state)}>
                          {HEALTH_LABEL[state]}
                        </span>
                        {state === "failed" && listing.lastError && (
                          <p className="m-0 mt-1 max-w-[260px]" style={{ color: "var(--app-danger-strong)" }}>{listing.lastError}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {listing.syncedVersion === null ? (
                          <span style={{ color: "var(--app-text-faintest)" }}>Never confirmed</span>
                        ) : listing.outOfDate ? (
                          <span style={{ color: "var(--app-warning-text)" }}>
                            Store v{listing.syncedVersion} · Noxtill v{listing.currentVersion}
                          </span>
                        ) : (
                          <span>v{listing.syncedVersion} (latest)</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {listing.sellingPriceAtSync === null ? (
                          <span style={{ color: "var(--app-text-faintest)" }}>Never confirmed</span>
                        ) : listing.priceOutOfDate ? (
                          <span style={{ color: "var(--app-warning-text)" }}>
                            Store {money(listing.sellingPriceAtSync, currency)} · now {money(listing.product.sellingPrice, currency)}
                          </span>
                        ) : (
                          <span>{money(listing.sellingPriceAtSync, currency)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--app-text-faint)" }}>
                        {listing.lastSyncedAt ? formatDate(listing.lastSyncedAt) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {state === "current" ? (
                          <span style={{ color: "var(--app-text-faintest)" }}>Nothing to do</span>
                        ) : listing.draftStatus !== "approved" ? (
                          <Link href="/autonomous-commerce/listing-builder" className="font-bold underline" style={{ color: "var(--app-warning-text)" }}>
                            Review new version first
                          </Link>
                        ) : !connected ? (
                          <Link href={`/integrations/${listing.provider}`} className="font-bold underline" style={{ color: "var(--app-warning-text)" }}>
                            Reconnect {PROVIDER_LABEL[listing.provider]}
                          </Link>
                        ) : canResync ? (
                          <button
                            type="button"
                            onClick={() => sync.mutate({ draftId: listing.draftId, target: listing.provider })}
                            disabled={sync.isPending}
                            className="rounded-lg px-3 py-1.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            style={{ background: "var(--app-primary)" }}
                          >
                            {syncingId === listing.draftId ? "Syncing…" : state === "failed" ? "Retry sync" : "Sync again"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
