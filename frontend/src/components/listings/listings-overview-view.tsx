"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { ConnectorCard } from "@/components/integrations/connector-card";
import { OAuthConnectDialog } from "@/components/integrations/oauth-connect-dialog";
import { CONNECTORS, type Connector, type ConnectorKey } from "@/lib/integrations";
import { fetchIntegrations } from "@/lib/integrations-api";
import { fetchMasterListing, updateMasterListing, syncListings, fetchListingHealth, type MasterListing } from "@/lib/master-listing-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const DIRECTORY_KEYS: ConnectorKey[] = ["gmb", "bing_places", "apple_business_connect", "yelp"];

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

export function ListingsOverviewView() {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<Connector | null>(null);

  const { data: liveStatuses } = useQuery({ queryKey: ["integrations"], queryFn: fetchIntegrations });
  const { data: health } = useQuery({ queryKey: ["listing-health"], queryFn: fetchListingHealth });
  const { data: listing, isPending, isError, refetch } = useQuery({ queryKey: ["master-listing"], queryFn: fetchMasterListing });

  const directories: Connector[] = CONNECTORS.filter((c) => DIRECTORY_KEYS.includes(c.key)).map((c) => ({
    ...c,
    status: liveStatuses?.[c.key] ?? "not_connected",
  }));
  const connectedCount = directories.filter((d) => d.status === "connected").length;

  const syncMutation = useMutation({
    mutationFn: syncListings,
    onSuccess: (results) => {
      const failed = results.filter((r) => r.status === "failed").length;
      if (failed > 0) {
        toast.info(`Synced — ${results.length - failed} succeeded, ${failed} failed. Check Sync & Health for details.`);
      } else if (results.length === 0) {
        toast.info("No connected directories to sync yet.");
      } else {
        toast.success(`Synced to ${results.length} director${results.length === 1 ? "y" : "ies"}.`);
      }
      void queryClient.invalidateQueries({ queryKey: ["listing-health"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't sync — please try again."),
  });

  function handleConnected(key: Connector["key"]) {
    void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    toast.success(`Connected ${key}.`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Business Listings</h1>
          <p className="mt-0.5 text-sm text-fg-muted">One record, pushed everywhere your business is listed.</p>
        </div>
        <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} aria-hidden />
          {syncMutation.isPending ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      {health && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Health score" value={`${health.score}`} />
          <StatCard label="Connected" value={`${connectedCount} of ${directories.length}`} />
          <StatCard label="Recent sync" value={health.hasRecentSync ? "Yes" : "No"} />
          <StatCard label="Mismatches" value={`${health.mismatchCount}`} />
        </div>
      )}

      <div className="mb-6">
        <p className="mb-3 text-sm font-medium text-fg">Directories</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {directories.map((c) => (
            <ConnectorCard key={c.key} connector={c} onConnect={setTarget} />
          ))}
        </div>
      </div>

      <p className="mb-3 text-sm font-medium text-fg">Master Business Record</p>
      {isError ? (
        <ErrorBanner title="Couldn't load your Master Business Record" onRetry={() => refetch()} />
      ) : isPending || !listing ? (
        <div className="flex flex-col gap-1 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        <MasterRecordForm key={listing.id ?? "new"} initial={listing} />
      )}

      <OAuthConnectDialog
        connector={target}
        onClose={() => setTarget(null)}
        onConnected={handleConnected}
        reconnect={target?.status === "needs_attention"}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <p className="text-xs text-fg-faint">{label}</p>
      <p className="mt-1 font-display text-xl font-bold text-fg">{value}</p>
    </div>
  );
}

function MasterRecordForm({ initial }: { initial: MasterListing }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  const [categoriesText, setCategoriesText] = useState(initial.categories.join(", "));

  const mutation = useMutation({
    mutationFn: () =>
      updateMasterListing({
        ...form,
        categories: categoriesText
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["master-listing"], updated);
      toast.success("Master Business Record saved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this record — please try again."),
  });

  function setDayHours(dayKey: string, range: [string, string] | null) {
    const hours = { ...form.hours };
    if (range) hours[dayKey] = [range];
    else delete hours[dayKey];
    setForm({ ...form, hours });
  }

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-fg">
        <Store className="h-4 w-4 text-fg-faint" aria-hidden />
        NAP (Name, Address, Phone)
      </div>
      <Input label="Business name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Phone" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input label="Website" value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} />
      </div>
      <Input label="Address line 1" value={form.addressLine1 ?? ""} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
      <Input label="Address line 2" value={form.addressLine2 ?? ""} onChange={(e) => setForm({ ...form, addressLine2: e.target.value })} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input label="City" value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <Input label="State" value={form.state ?? ""} onChange={(e) => setForm({ ...form, state: e.target.value })} />
        <Input label="Postal code" value={form.postalCode ?? ""} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
      </div>
      <Input label="Country" value={form.country ?? ""} onChange={(e) => setForm({ ...form, country: e.target.value })} />
      <Input label="Categories" value={categoriesText} onChange={(e) => setCategoriesText(e.target.value)} hint="Comma-separated, e.g. Restaurant, Pizza" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="listing-description" className="text-sm font-medium text-fg">
          Description
        </label>
        <textarea
          id="listing-description"
          value={form.description ?? ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-2 text-sm font-medium text-fg">Hours</p>
        <div className="flex flex-col gap-2">
          {DAYS.map((day) => {
            const range = form.hours[day.key]?.[0];
            const open = !!range;
            return (
              <div key={day.key} className="flex flex-wrap items-center gap-3 border-b border-border py-2 last:border-0">
                <label className="flex w-32 shrink-0 items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={open}
                    onChange={(e) => setDayHours(day.key, e.target.checked ? ["09:00", "17:00"] : null)}
                    className="h-4 w-4 rounded border-border-strong accent-primary"
                  />
                  {day.label}
                </label>
                {open ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={range![0]}
                      onChange={(e) => setDayHours(day.key, [e.target.value, range![1]])}
                      className="h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-sm text-fg"
                    />
                    <span className="text-fg-faint">–</span>
                    <input
                      type="time"
                      value={range![1]}
                      onChange={(e) => setDayHours(day.key, [range![0], e.target.value])}
                      className="h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-sm text-fg"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-fg-faint">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name.trim()}>
          {mutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
