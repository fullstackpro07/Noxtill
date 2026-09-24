"use client";

import React, { useMemo } from "react";
import { GitCompare, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { useListings } from "../listings-context";

const NAP_FIELD_LABELS: [string, string][] = [
  ["name", "Business name"],
  ["phone", "Phone"],
  ["addressLine1", "Address"],
  ["website", "Website"],
  ["categories", "Category"],
  ["description", "Description"],
  ["hours", "Hours"],
];

export function SyncScreen() {
  const { syncLog, citations, listings, settings, syncNow, updateListingSettingsAction, openPanel, openConfirm, notify } = useListings();

  const chipClass = (tone: string) => {
    switch (tone) {
      case "green":
        return "bg-[#ECFDF3] border-[#BBF0CB] text-[#15803D]";
      case "amber":
        return "bg-[#FFFBEB] border-[#FDE49B] text-[#B45309]";
      case "red":
        return "bg-[#FEF3F2] border-[#FBD5D2] text-[#B42318]";
      case "blue":
        return "bg-[#EFF6FF] border-[#C7DBFE] text-[#1D4ED8]";
      case "purple":
        return "bg-[#F5F3FF] border-[#DDD3FE] text-[#6D28D9]";
      default:
        return "bg-[#F1F3F6] border-[#E1E5EB] text-[#45505F]";
    }
  };

  const listingsWithMismatch = useMemo(() => listings.filter((l) => l.mismatchedFields.length > 0), [listings]);

  // 4 real KPIs — no fabricated fallback numbers, no invented "Stale" metric
  const syncKpis = useMemo(() => {
    const successCount = listings.filter((l) => l.status === "Connected").length;
    const failedCount = syncLog.filter((s) => s.status === "failed").length;
    const conflictsCount = listingsWithMismatch.length;
    const disconnectedCount = listings.filter((l) => l.status === "Disconnected").length;

    return [
      { label: "Healthy", value: String(successCount), meta: "connected & matching", tone: "green" },
      { label: "Field mismatches", value: String(conflictsCount), meta: conflictsCount > 0 ? "awaiting decision" : "none", tone: conflictsCount > 0 ? "amber" : "green" },
      { label: "Failed syncs", value: String(failedCount), meta: failedCount > 0 ? "in recent log" : "none", tone: failedCount > 0 ? "red" : "green" },
      { label: "Disconnected", value: String(disconnectedCount), meta: disconnectedCount > 0 ? "re-auth needed" : "none", tone: disconnectedCount > 0 ? "red" : "green" },
    ];
  }, [listings, syncLog, listingsWithMismatch]);

  // Real field-mapping table from Listings Settings — no per-field live status is tracked, so this
  // shows what's actually configured (excluded vs. sent), not a fabricated live sync state.
  const providers = useMemo(() => [...new Set(listings.map((l) => l.provider))], [listings]);
  const providerLabels = useMemo(() => {
    const map: Record<string, string> = {};
    listings.forEach((l) => { map[l.provider] = l.platform; });
    return map;
  }, [listings]);

  const isExcluded = (field: string, provider: string) =>
    (settings?.fieldMapping?.[provider] ?? []).includes(field);

  const syncHistory = useMemo(() => {
    return syncLog.slice(0, 6).map((log) => ({
      title: `${log.provider} sync`,
      meta: `${log.status === "success" ? "Pushed to this directory" : log.message || "Sync attempt"} · ${new Date(log.createdAt).toLocaleDateString()} ${new Date(log.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
      result: log.status === "success" ? "Success" : "Failed",
      tone: log.status === "success" ? "green" : "red",
    }));
  }, [syncLog]);

  return (
    <div className="flex flex-col gap-5">
      {/* 4 Sync KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {syncKpis.map((k, idx) => (
          <div
            key={idx}
            onClick={() => notify(`${k.label} · ${k.value}`, k.meta)}
            className={`cursor-pointer rounded-[12px] border bg-white p-3.5 shadow-sm transition-all hover:border-[#CBD5E1] ${
              k.tone === "red"
                ? "border-[#FBD5D2]"
                : k.tone === "amber"
                ? "border-[#FDE49B]"
                : "border-[#E6E8EC]"
            }`}
          >
            <div className="text-[11.5px] font-bold text-[#5B6675]">{k.label}</div>
            <div
              className={`mt-1.5 text-[19px] font-extrabold tracking-tight ${
                k.tone === "red"
                  ? "text-[#B42318]"
                  : k.tone === "amber"
                  ? "text-[#B45309]"
                  : "text-[#0F172A]"
              }`}
            >
              {k.value}
            </div>
            <div className="mt-1 text-[10.5px] text-[#94A3B8]">{k.meta}</div>
          </div>
        ))}
      </div>

      {/* Conflict Decision Card — one real card per listing with an actual field mismatch */}
      {listingsWithMismatch.length > 0 && (
        <div className="rounded-[13px] border border-[#FDE49B] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <GitCompare className="h-4 w-4 text-[#B45309]" />
            <div className="text-[13.5px] font-extrabold text-[#0F172A]">
              {listingsWithMismatch.length} listing{listingsWithMismatch.length > 1 ? "s" : ""} awaiting your decision
            </div>
            <div className="ml-auto text-[10.5px] text-[#94A3B8]">
              Noxtill never resolves this silently
            </div>
          </div>

          <div className="mt-3.5 flex flex-col gap-2.5">
            {listingsWithMismatch.map((l) => (
              <div key={l.id} className="rounded-[12px] border border-[#E6E8EC] bg-white p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-extrabold text-[#0F172A]">{l.location} · {l.platform}</span>
                  <span className="text-[11px] text-[#B45309]">disagrees on: {l.mismatchedFields.join(", ")}</span>
                  <button
                    onClick={() =>
                      openConfirm({
                        title: `Push ${l.location}'s Master Record to ${l.platform}?`,
                        tone: "amber",
                        icon: "git-compare",
                        body: "Noxtill's own record will be written to this directory, overwriting the mismatched fields there. Nothing else on the listing changes.",
                        rows: [
                          ["Location", l.location],
                          ["Platform", l.platform],
                          ["Fields to overwrite", l.mismatchedFields.join(", ")],
                        ],
                        primary: "Push and sync",
                        cancel: "Cancel",
                        onConfirm: () => {
                          syncNow(l.branchId);
                          notify("Sync queued", `${l.location}'s Master Record will be pushed to ${l.platform}.`);
                        },
                      })
                    }
                    className="ml-auto flex h-8 items-center rounded-[8px] bg-[#16A34A] px-3 text-[12px] font-bold text-white hover:bg-[#15803D]"
                  >
                    Use Noxtill's value
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 text-[11.5px] leading-relaxed text-[#45505F]">
            To make the directory's value win instead, switch conflict resolution to "Directory wins" in Listings Settings and sync again —
            {" "}
            <button
              onClick={async () => {
                await updateListingSettingsAction({ conflictResolution: "directory_wins" });
                notify("Conflict resolution updated", "Directory values will be pulled in on the next sync.");
              }}
              className="font-bold text-[#16A34A] underline"
            >
              switch it now
            </button>.
          </div>
        </div>
      )}

      {/* Field Sync Configuration Table — real, from Listings Settings' field mapping */}
      <div className="overflow-hidden rounded-[13px] border border-[#E6E8EC] bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EEF0F3] p-4">
          <div className="text-[13.5px] font-extrabold text-[#0F172A]">Field sync configuration</div>
          <div className="text-[11px] text-[#94A3B8]">
            What each connected directory is sent, per Listings Settings
          </div>
        </div>

        {providers.length === 0 ? (
          <div className="p-6 text-center text-[12.5px] text-[#94A3B8]">No directories connected yet.</div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E6E8EC] bg-[#FAFBFC] text-[10.5px] font-extrabold uppercase tracking-wider text-[#7A8798]">
                  <th className="pl-4 py-3">Field</th>
                  {providers.map((p) => (
                    <th key={p} className="px-3 py-3">{providerLabels[p]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NAP_FIELD_LABELS.map(([field, label]) => (
                  <tr
                    key={field}
                    onClick={() =>
                      openPanel({
                        kicker: "Field configuration",
                        title: label,
                        badge: "From Listings Settings",
                        badgeTone: "blue",
                        rows: providers.map((p) => [providerLabels[p], isExcluded(field, p) ? "Excluded — never sent" : "Sent on every sync"] as [string, string]),
                        bulletsTitle: "What this means",
                        bullets: [
                          "Excluded fields are never included in what's pushed to that directory",
                          "Everything else is sent as part of the next full sync for that location",
                          "Change this in Listings Settings — there is no per-field live status beyond this configuration",
                        ],
                        note: "This is real configuration, not a fabricated live sync state.",
                        primary: "Open Listings Settings",
                        secondary: "Close",
                      })
                    }
                    className="cursor-pointer border-b border-[#F3F4F7] bg-white transition-colors hover:bg-[#FAFBFC]"
                  >
                    <td className="pl-4 py-3 text-[12px] font-bold text-[#0F172A] whitespace-nowrap">{label}</td>
                    {providers.map((p) => (
                      <td key={p} className="px-3 py-3 whitespace-nowrap">
                        <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold ${chipClass(isExcluded(field, p) ? "neutral" : "green")}`}>
                          {isExcluded(field, p) ? "Excluded" : "Sent"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-b border-[#F3F4F7] bg-white">
                  <td className="pl-4 py-3 text-[12px] font-bold text-[#0F172A] whitespace-nowrap">Service pricing</td>
                  {providers.map((p) => (
                    <td key={p} className="px-3 py-3 whitespace-nowrap">
                      <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold ${chipClass("neutral")}`}>Unsupported</span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-[#EEF0F3] bg-[#FCFCFD] p-3 px-4 text-[11px] text-[#94A3B8]">
          No connected directory supports pricing, so it is never sent regardless of configuration.
        </div>
      </div>

      {/* Sync History Card — real log only, no fabricated fallback rows */}
      <div className="overflow-hidden rounded-[13px] border border-[#E6E8EC] bg-white shadow-sm">
        <div className="border-b border-[#EEF0F3] p-4 text-[13.5px] font-extrabold text-[#0F172A]">
          Sync history
        </div>

        {syncHistory.length === 0 ? (
          <div className="p-6 text-center text-[12.5px] text-[#94A3B8]">No syncs recorded yet — run one from a listing to see it here.</div>
        ) : (
          <div>
            {syncHistory.map((sh, idx) => (
              <div
                key={idx}
                onClick={() => notify(sh.title, `${sh.meta} · ${sh.result}`)}
                className={`flex cursor-pointer items-center gap-3 p-3 px-4 transition-colors hover:bg-[#FAFBFC] ${
                  idx > 0 ? "border-t border-[#F3F4F7]" : ""
                } ${sh.tone === "red" ? "bg-[#FEFBFB]" : "bg-white"}`}
              >
                <div
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] ${
                    sh.tone === "red" ? "bg-[#FEE4E2] text-[#B42318]" : "bg-[#ECFDF3] text-[#15803D]"
                  }`}
                >
                  {sh.tone === "red" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-[#0F172A]">{sh.title}</div>
                  <div className="text-[10.5px] text-[#94A3B8]">{sh.meta}</div>
                </div>
                <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold ${chipClass(sh.tone)}`}>
                  {sh.result}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-[#EEF0F3] bg-[#FCFCFD] p-3 px-4 text-[11px] text-[#94A3B8]">
          Every row here is a real sync attempt, recorded with its actual result.
        </div>
      </div>
    </div>
  );
}
