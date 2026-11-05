"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import {
  fetchSeoAnalyticsAttributionSummary,
  refreshSeoAnalyticsProperties,
  selectSeoAnalyticsProperty,
  syncSeoOrganicAttribution,
  type SeoAnalyticsWindow,
} from "@/lib/seo-analytics-attribution-api";
import { toast } from "@/lib/toast";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function Metric({ label, value }: { label: string; value: string | null }) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--app-border)" }}
    >
      <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
        {label}
      </p>
      <p className="m-0 mt-1 text-sm font-bold">{value ?? "Not available"}</p>
    </div>
  );
}

function Period({
  title,
  window,
  currencyCode,
}: {
  title: string;
  window: SeoAnalyticsWindow;
  currencyCode: string | null;
}) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: "var(--app-border)" }}
    >
      <p className="m-0 text-xs font-bold">{title}</p>
      <p
        className="m-0 mt-1 text-[11px]"
        style={{ color: "var(--app-text-faint)" }}
      >
        {window.startDate} to {window.endDate} ·{" "}
        {window.dataState === "returned" ? "Data returned" : "No data returned"}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Metric label="Organic Search sessions" value={window.sessions} />
        <Metric label="GA4 key events" value={window.keyEvents} />
        <Metric
          label={`GA4 total revenue${currencyCode ? ` · ${currencyCode}` : ""}`}
          value={window.totalRevenue}
        />
      </div>
    </div>
  );
}

export function SeoAnalyticsAttributionCard() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["seo-analytics-attribution"],
    queryFn: fetchSeoAnalyticsAttributionSummary,
  });
  const reload = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["seo-analytics-attribution"],
      }),
      queryClient.invalidateQueries({ queryKey: ["seo-agent-workspace"] }),
    ]);
  };
  const refresh = useMutation({
    mutationFn: refreshSeoAnalyticsProperties,
    onSuccess: reload,
    onError: (error) =>
      toast.error(
        errorMessage(error, "Could not refresh Google Analytics properties."),
      ),
  });
  const select = useMutation({
    mutationFn: selectSeoAnalyticsProperty,
    onSuccess: async () => {
      await reload();
      toast.success("Google Analytics property selected.");
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, "Could not select that Google Analytics property."),
      ),
  });
  const sync = useMutation({
    mutationFn: syncSeoOrganicAttribution,
    onSuccess: async () => {
      await reload();
      toast.success("Organic Search metrics refreshed from Google Analytics.");
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, "Could not load Google Analytics metrics."),
      ),
  });
  const data = query.data;

  return (
    <section
      data-testid="seo-analytics-attribution"
      className="rounded-2xl border p-4"
      style={{
        background: "var(--app-surface)",
        borderColor: "var(--app-border)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-sm font-bold">Google Analytics 4</h2>
          <p
            className="m-0 mt-1 max-w-3xl text-xs"
            style={{ color: "var(--app-text-muted)" }}
          >
            Read-only Organic Search sessions, GA4 key events and GA4 total
            revenue from the selected property. Total revenue can include
            purchase, subscription and advertising revenue less refunds. This is
            channel attribution, not proof that SEO work caused a result or a
            Noxtill sales-ledger total.
          </p>
        </div>
        <span
          className="text-xs font-semibold"
          style={{
            color:
              data?.status === "connected"
                ? "var(--app-success-text)"
                : "var(--app-warning-text)",
          }}
        >
          {query.isLoading
            ? "Checking…"
            : data?.status === "connected"
              ? "Connected"
              : data?.status === "needs_attention"
                ? "Needs attention"
                : "Not connected"}
        </span>
      </div>
      {query.isError ? (
        <div
          className="mt-3 flex items-center gap-3 text-xs"
          style={{ color: "var(--app-danger-strong)" }}
        >
          {errorMessage(query.error, "Could not load Google Analytics status.")}
          <button
            type="button"
            onClick={() => query.refetch()}
            className="font-bold underline"
          >
            Retry
          </button>
        </div>
      ) : data?.status !== "connected" ? (
        <p
          className="m-0 mt-3 text-xs"
          style={{ color: "var(--app-text-faint)" }}
        >
          Connect the Google account that can read the Analytics property from{" "}
          <Link href="/integrations" className="font-bold underline">
            Integrations
          </Link>
          . The connection requests read-only Analytics access.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex min-w-64 flex-col gap-1 text-xs font-semibold">
              Google Analytics property
              <select
                aria-label="Google Analytics property"
                value={data.selectedProperty ?? ""}
                onChange={(event) =>
                  event.target.value && select.mutate(event.target.value)
                }
                disabled={select.isPending || data.properties.length === 0}
                className="rounded-lg border px-3 py-2 text-sm font-normal"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-surface)",
                  color: "var(--app-text)",
                }}
              >
                <option value="">Select an accessible property</option>
                {data.properties.map((property) => (
                  <option key={property.property} value={property.property}>
                    {property.displayName} · {property.property}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50"
              style={{ borderColor: "var(--app-border)" }}
            >
              {refresh.isPending ? "Refreshing…" : "Refresh properties"}
            </button>
            <button
              type="button"
              onClick={() => sync.mutate()}
              disabled={!data.selectedProperty || sync.isPending}
              className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50"
              style={{ borderColor: "var(--app-border)" }}
            >
              {sync.isPending ? "Syncing…" : "Sync Organic Search"}
            </button>
          </div>
          {data.properties.length === 0 && (
            <p
              className="m-0 mt-2 text-xs"
              style={{ color: "var(--app-text-faint)" }}
            >
              No Analytics properties loaded. Refresh to list properties
              accessible to the connected account.
            </p>
          )}
          {data.selectedProperty && !data.snapshot && (
            <p
              className="m-0 mt-3 text-xs"
              style={{ color: "var(--app-text-faint)" }}
            >
              Not synced yet. Sync to fetch two real {data.windowDays}-day
              periods; the current period ends on the previous calendar day in
              the property&apos;s time zone.
            </p>
          )}
          {data.snapshot && (
            <>
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                <Period
                  title="Current period"
                  window={data.snapshot.current}
                  currencyCode={data.snapshot.currencyCode}
                />
                <Period
                  title="Previous period"
                  window={data.snapshot.comparison}
                  currencyCode={data.snapshot.currencyCode}
                />
              </div>
              <section
                className="mt-3 rounded-xl border p-3"
                style={{ borderColor: "var(--app-border)" }}
                aria-label="Organic Search landing pages"
              >
                <h3 className="m-0 text-xs font-bold">
                  Current period · Organic Search landing pages
                </h3>
                {!data.snapshot.current.landingPages ||
                data.snapshot.current.landingPages.dataState ===
                  "not_available" ? (
                  <p
                    className="m-0 mt-2 text-xs"
                    style={{ color: "var(--app-text-faint)" }}
                  >
                    {data.snapshot.current.landingPages?.reason ??
                      "Page-level metrics were not included in this saved snapshot. Sync again to request them."}
                  </p>
                ) : data.snapshot.current.landingPages.dataState ===
                  "no_data_returned" ? (
                  <p
                    className="m-0 mt-2 text-xs"
                    style={{ color: "var(--app-text-faint)" }}
                  >
                    Google Analytics returned no landing-page rows for this
                    Organic Search period.
                  </p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead style={{ color: "var(--app-text-faint)" }}>
                        <tr>
                          <th className="py-2 pe-3">Page path</th>
                          <th className="py-2 pe-3">Sessions</th>
                          <th className="py-2 pe-3">Key events</th>
                          <th className="py-2">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.snapshot.current.landingPages.rows
                          .slice(0, 10)
                          .map((row) => (
                            <tr
                              key={row.landingPage}
                              className="border-t"
                              style={{ borderColor: "var(--app-border)" }}
                            >
                              <td className="py-2 pe-3 font-mono">
                                {row.landingPage}
                              </td>
                              <td className="py-2 pe-3 tabular-nums">
                                {row.sessions ?? "Not available"}
                              </td>
                              <td className="py-2 pe-3 tabular-nums">
                                {row.keyEvents ?? "Not available"}
                              </td>
                              <td className="py-2 tabular-nums">
                                {row.totalRevenue === null
                                  ? "Not available"
                                  : `${data.snapshot?.currencyCode ?? "Currency not available"} ${row.totalRevenue}`}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {data.snapshot.current.landingPages?.truncated && (
                  <p
                    className="m-0 mt-2 text-[11px]"
                    style={{ color: "var(--app-text-faintest)" }}
                  >
                    Google returned the top 250 rows out of{" "}
                    {data.snapshot.current.landingPages.totalRows ??
                      "an unavailable number of"}{" "}
                    landing pages. The table shows the first 10.
                  </p>
                )}
                <p
                  className="m-0 mt-2 text-[11px]"
                  style={{ color: "var(--app-text-faintest)" }}
                >
                  Google&apos;s landingPage dimension is a page path without a
                  query string. GA4 reporting and attribution settings apply;
                  these values do not prove an SEO change caused the result.
                </p>
              </section>
            </>
          )}
          <p
            className="m-0 mt-3 text-[11px]"
            style={{ color: "var(--app-text-faintest)" }}
          >
            {data.disclosure}
            {data.lastSyncAt
              ? ` Last sync ${new Date(data.lastSyncAt).toLocaleString()}.`
              : ""}
          </p>
        </>
      )}
    </section>
  );
}
