"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import {
  fetchListingSettings,
  updateListingSettings,
  type ListingSettings,
  type ConflictResolution,
} from "@/lib/listing-settings-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const NAP_FIELDS = [
  "name",
  "phone",
  "website",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
] as const;

const NAP_FIELD_LABELS: Record<(typeof NAP_FIELDS)[number], string> = {
  name: "Business name",
  phone: "Phone",
  website: "Website",
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  city: "City",
  state: "State",
  postalCode: "Postal code",
  country: "Country",
};

const DIRECTORIES = [
  { key: "gmb", label: "Google" },
  { key: "bing_places", label: "Bing Places" },
  { key: "apple_business_connect", label: "Apple Business Connect" },
  { key: "yelp", label: "Yelp" },
] as const;

export function ListingSettingsView() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["listing-settings"], queryFn: fetchListingSettings });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-5 font-display text-2xl font-bold text-fg">Listings Settings</h1>
      {isError ? (
        <ErrorBanner title="Couldn't load Listings Settings" onRetry={() => refetch()} />
      ) : isPending || !data ? (
        <div className="flex flex-col gap-1 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        <ListingSettingsForm key={data.id ?? "new"} initial={data} />
      )}
    </div>
  );
}

function ListingSettingsForm({ initial }: { initial: ListingSettings }) {
  const queryClient = useQueryClient();
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(initial.autoSyncEnabled);
  const [autoSyncFrequencyHours, setAutoSyncFrequencyHours] = useState(initial.autoSyncFrequencyHours);
  const [fieldMapping, setFieldMapping] = useState(initial.fieldMapping);
  const [conflictResolution, setConflictResolution] = useState<ConflictResolution>(initial.conflictResolution);

  const mutation = useMutation({
    mutationFn: () => updateListingSettings({ autoSyncEnabled, autoSyncFrequencyHours, fieldMapping, conflictResolution }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["listing-settings"], updated);
      toast.success("Listings Settings saved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save these settings — please try again."),
  });

  function toggleExcluded(provider: string, field: string) {
    const excluded = new Set(fieldMapping[provider] ?? []);
    if (excluded.has(field)) excluded.delete(field);
    else excluded.add(field);
    setFieldMapping({ ...fieldMapping, [provider]: [...excluded] });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-fg">Auto-sync</p>
            <p className="mt-0.5 text-sm text-fg-muted">Automatically push your Master Business Record on a schedule.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoSyncEnabled}
            onClick={() => setAutoSyncEnabled((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${autoSyncEnabled ? "bg-whatsapp" : "bg-surface-2"}`}
          >
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${autoSyncEnabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        {autoSyncEnabled && (
          <div className="mt-4">
            <Select label="Frequency" value={String(autoSyncFrequencyHours)} onChange={(e) => setAutoSyncFrequencyHours(Number(e.target.value))}>
              <option value="1">Every hour</option>
              <option value="6">Every 6 hours</option>
              <option value="24">Daily</option>
              <option value="168">Weekly</option>
            </Select>
          </div>
        )}
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-1 text-sm font-medium text-fg">Field mapping</p>
        <p className="mb-3 text-sm text-fg-muted">Check a box to exclude that field from being pushed to that directory.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-2 py-2 text-start">Field</th>
                {DIRECTORIES.map((d) => (
                  <th key={d.key} className="px-2 py-2 text-center">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NAP_FIELDS.map((field) => (
                <tr key={field} className="border-b border-border last:border-0">
                  <td className="px-2 py-2.5 text-fg">{NAP_FIELD_LABELS[field]}</td>
                  {DIRECTORIES.map((d) => (
                    <td key={d.key} className="px-2 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={(fieldMapping[d.key] ?? []).includes(field)}
                        onChange={() => toggleExcluded(d.key, field)}
                        className="h-4 w-4 rounded border-border-strong text-primary focus:ring-primary/30"
                        aria-label={`Exclude ${NAP_FIELD_LABELS[field]} from ${d.label}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-1 text-sm font-medium text-fg">Conflict resolution</p>
        <p className="mb-3 text-sm text-fg-muted">
          When a directory&apos;s own record disagrees with your Master Business Record, choose which one wins the next time you sync.
        </p>
        <Select label="On conflict" value={conflictResolution} onChange={(e) => setConflictResolution(e.target.value as ConflictResolution)}>
          <option value="master_wins">Master Record wins</option>
          <option value="directory_wins">Directory wins</option>
        </Select>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
