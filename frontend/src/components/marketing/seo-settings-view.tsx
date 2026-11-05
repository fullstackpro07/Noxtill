"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { fetchHubCategory, saveHubChanges, type HubRow } from "@/lib/settings-hub-api";
import { fetchSeoSettingsSummary } from "@/lib/seo-settings-api";
import {
  fetchSeoSearchConsoleSummary,
  refreshSeoSearchConsoleProperties,
  selectSeoSearchConsoleProperty,
  syncSeoSearchConsolePerformance,
} from "@/lib/seo-search-console-api";
import { SeoAnalyticsAttributionCard } from "@/components/marketing/seo-analytics-attribution-card";

const TONE_COLOR: Record<string, string> = {
  green: "var(--app-success-text)",
  amber: "var(--app-warning-text)",
  red: "var(--app-danger-strong)",
  blue: "var(--app-primary)",
  purple: "var(--app-primary)",
  neutral: "var(--app-text-faint)",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="m-0 mt-1 text-lg font-bold">{value}</p>
      <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>{hint}</p>
    </div>
  );
}

/** One Settings-hub row, edited in place; saving goes through the hub so it is permission-checked and versioned. */
function SettingRow({ row }: { row: HubRow }) {
  const client = useQueryClient();
  const control = row.control;
  const [draft, setDraft] = useState(control?.type === "number" ? String(control.current ?? "") : "");
  const save = useMutation({
    mutationFn: (value: string | number | boolean) => saveHubChanges([{ category: "seo", rowKey: row.key, value }]),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ["settings-hub"] }), client.invalidateQueries({ queryKey: ["seo-settings-summary"] })]);
      toast.success("Saved.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't save the setting.")),
  });
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-t px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
      <div className="min-w-0 max-w-xl">
        <p className="m-0 text-sm font-semibold">{row.label}</p>
        <p className="m-0 mt-0.5 text-xs" style={{ color: "var(--app-text-faint)" }}>{row.description}</p>
        {row.impact && <p className="m-0 mt-0.5 text-xs" style={{ color: "var(--app-text-faintest)" }}>{row.impact}</p>}
      </div>
      <div className="flex items-center gap-2">
        {control?.type === "toggle" && row.editable ? (
          <button
            type="button"
            role="switch"
            aria-checked={control.on}
            aria-label={row.label}
            disabled={save.isPending}
            onClick={() => save.mutate(!control.on)}
            className="rounded-full border px-3 py-1 text-xs font-bold disabled:opacity-50"
            style={{ borderColor: "var(--app-border)", color: TONE_COLOR[row.valueTone] }}
          >
            {row.value}
          </button>
        ) : control?.type === "number" && row.editable ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim() !== "") save.mutate(Number(draft));
            }}
          >
            <input type="number" value={draft} min={control.min} max={control.max} step={control.step ?? 1} onChange={(event) => setDraft(event.target.value)} aria-label={row.label} className="w-24 rounded-lg border px-2 py-1 text-sm" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }} />
            {control.unit && <span className="text-xs" style={{ color: "var(--app-text-faint)" }}>{control.unit}</span>}
            <button type="submit" disabled={save.isPending || draft === String(control.current ?? "")} className="text-xs font-bold underline disabled:opacity-40">Save</button>
          </form>
        ) : (
          <span className="text-xs font-bold" style={{ color: TONE_COLOR[row.valueTone] }}>{row.value}</span>
        )}
        {!row.editable && row.locked && <span className="text-[11px]" style={{ color: "var(--app-text-faintest)" }}>{row.locked}</span>}
      </div>
    </div>
  );
}

export function SeoSettingsView() {
  const client = useQueryClient();
  const summary = useQuery({ queryKey: ["seo-settings-summary"], queryFn: fetchSeoSettingsSummary });
  const searchConsole = useQuery({ queryKey: ["seo-search-console"], queryFn: fetchSeoSearchConsoleSummary });
  const category = useQuery({ queryKey: ["settings-hub", "category", "seo"], queryFn: () => fetchHubCategory("seo") });
  const data = summary.data;
  const loading = summary.isLoading;
  const refreshProperties = useMutation({
    mutationFn: refreshSeoSearchConsoleProperties,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["seo-search-console"] });
      toast.success("Search Console properties refreshed.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't refresh Search Console properties.")),
  });
  const selectProperty = useMutation({
    mutationFn: selectSeoSearchConsoleProperty,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["seo-search-console"] });
      await client.invalidateQueries({ queryKey: ["seo-search-console-keywords"] });
      toast.success("Search Console property selected.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't select that Search Console property.")),
  });
  const syncPerformance = useMutation({
    mutationFn: syncSeoSearchConsolePerformance,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["seo-search-console"] });
      await client.invalidateQueries({ queryKey: ["seo-search-console-keywords"] });
      toast.success("Search Console performance refreshed.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't load Search Console performance.")),
  });

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 max-w-3xl text-xs" style={{ color: "var(--app-text-muted)" }}>
        These rules are stored with your business settings — every change is permission-checked and kept in{" "}
        <Link href="/settings/seo" className="underline">Settings → SEO Autopilot</Link> history, where you can also reset them. Credentials are never shown here, only whether a source is configured.
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Configuration health" value={loading ? "…" : data ? `${data.configurationHealth.ok} of ${data.configurationHealth.of}` : "—"} hint="Checks passing below" />
        <Kpi label="Site" value={loading ? "…" : data?.site.url ?? "Not set"} hint={data?.site.source ? `From the ${data.site.source}` : "Run a site audit to set it"} />
        <Kpi label="Market" value={loading ? "…" : data?.market.country ?? "Not set"} hint={data ? `Language ${data.market.locale}` : "Business country"} />
        <Kpi label="Autopilot level" value={loading ? "…" : data ? (data.aiDraftsEnabled ? "L1 · Draft" : "L0 · Observe") : "—"} hint="L3–L4 auto-apply not available" />
        <Kpi label="Approval policy" value="Always required" hint="Every SEO change needs approval" />
      </section>

      {data && (
        <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
          <p className="m-0 px-4 pt-3 text-sm font-bold">Setup checks</p>
          <ul className="m-0 flex list-none flex-col p-0 pb-1">
            {data.checks.map((check) => (
              <li key={check.key} className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs" style={{ borderColor: "var(--app-border)" }}>
                <span>
                  <span className="font-semibold" style={{ color: check.ok ? "var(--app-success-text)" : "var(--app-warning-text)" }}>{check.ok ? "✓" : "!"}</span> {check.label}
                  <span className="ms-2" style={{ color: "var(--app-text-faint)" }}>{check.detail}</span>
                </span>
                {!check.ok && <Link href={check.href} className="font-bold underline">Fix</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border p-4" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-sm font-bold">Google Search Console</h2>
            <p className="m-0 mt-1 max-w-3xl text-xs" style={{ color: "var(--app-text-muted)" }}>
              Read-only property performance from Google. No query strings or page URLs are saved; Google may omit anonymized or low-volume queries.
            </p>
          </div>
          <span className="text-xs font-semibold" style={{ color: searchConsole.data?.status === "connected" ? "var(--app-success-text)" : "var(--app-warning-text)" }}>
            {searchConsole.isLoading ? "Checking…" : searchConsole.data?.status === "connected" ? "Connected" : searchConsole.data?.status === "needs_attention" ? "Needs attention" : "Not connected"}
          </span>
        </div>
        {searchConsole.isError ? (
          <div className="mt-3 flex items-center gap-3 text-xs" style={{ color: "var(--app-danger-strong)" }}>
            {errorMessage(searchConsole.error, "Couldn't load Search Console status.")}
            <button type="button" onClick={() => searchConsole.refetch()} className="font-bold underline">Retry</button>
          </div>
        ) : searchConsole.data?.status !== "connected" ? (
          <p className="m-0 mt-3 text-xs" style={{ color: "var(--app-text-faint)" }}>
            Connect the Google account that has access to your verified Search Console property from <Link href="/integrations" className="font-bold underline">Integrations</Link>.
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex min-w-64 flex-col gap-1 text-xs font-semibold">
                Search Console property
                <select
                  aria-label="Search Console property"
                  value={searchConsole.data.selectedProperty ?? ""}
                  onChange={(event) => {
                    if (event.target.value) selectProperty.mutate(event.target.value);
                  }}
                  disabled={selectProperty.isPending || searchConsole.data.properties.length === 0}
                  className="rounded-lg border px-3 py-2 text-sm font-normal"
                  style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }}
                >
                  <option value="">Select an accessible property</option>
                  {searchConsole.data.properties.map((property) => (
                    <option key={property.siteUrl} value={property.siteUrl}>{property.siteUrl} · {property.permissionLevel}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => refreshProperties.mutate()} disabled={refreshProperties.isPending} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)" }}>
                {refreshProperties.isPending ? "Refreshing…" : "Refresh properties"}
              </button>
              <button type="button" onClick={() => syncPerformance.mutate()} disabled={!searchConsole.data.selectedProperty || syncPerformance.isPending} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)" }}>
                {syncPerformance.isPending ? "Syncing…" : "Sync performance"}
              </button>
            </div>
            {searchConsole.data.properties.length === 0 && (
              <p className="m-0 mt-2 text-xs" style={{ color: "var(--app-text-faint)" }}>No properties loaded yet. Refresh to fetch properties the connected Google account can access.</p>
            )}
            {searchConsole.data.selectedProperty && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[...searchConsole.data.snapshots].sort((a, b) => b.endDate.localeCompare(a.endDate)).map((snapshot) => (
                  <div key={snapshot.id} className="rounded-xl border p-3" style={{ borderColor: "var(--app-border)" }}>
                    <p className="m-0 text-xs font-bold">{snapshot.startDate} to {snapshot.endDate} · {snapshot.dataState === "final" ? "Final data" : "No data returned"}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <span>Clicks <strong>{snapshot.clicks ?? "Not available"}</strong></span>
                      <span>Impressions <strong>{snapshot.impressions ?? "Not available"}</strong></span>
                      <span>CTR <strong>{snapshot.clickThroughRate === null ? "Not available" : `${(snapshot.clickThroughRate * 100).toFixed(2)}%`}</strong></span>
                      <span>Average position <strong>{snapshot.averagePosition === null ? "Not available" : snapshot.averagePosition.toFixed(2)}</strong></span>
                    </div>
                  </div>
                ))}
                {searchConsole.data.snapshots.length === 0 && (
                  <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>No performance snapshots yet. Sync to fetch two real {searchConsole.data.windowDays}-day windows from Google.</p>
                )}
              </div>
            )}
            {searchConsole.data.lastSyncAt && <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faintest)" }}>Last successful sync {new Date(searchConsole.data.lastSyncAt).toLocaleString()}</p>}
          </>
        )}
      </section>

      <SeoAnalyticsAttributionCard />

      {category.isLoading ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading rules…</p>
      ) : category.isError ? (
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--app-danger-strong)" }}>
          {errorMessage(category.error, "Couldn't load SEO settings.")}
          <button type="button" onClick={() => category.refetch()} className="font-bold underline">Retry</button>
        </div>
      ) : (
        (category.data?.groups ?? []).map((group) => (
          <section key={group.title} className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
            <div className="px-4 pt-3 pb-2">
              <p className="m-0 text-sm font-bold">{group.title}</p>
              {group.hint && <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>{group.hint}</p>}
            </div>
            {group.rows.map((row) => <SettingRow key={`${row.key}-${row.value}`} row={row} />)}
          </section>
        ))
      )}

      {data && (
        <section className="rounded-2xl border p-4 text-xs" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
          <p className="m-0 font-bold">Not connected</p>
          <ul className="m-0 mt-1 list-disc ps-5" style={{ color: "var(--app-text-muted)" }}>
            {data.notConnected.map((row) => <li key={row.label}><strong>{row.label}:</strong> {row.reason}</li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
