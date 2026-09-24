"use client";

import React, { useState, useMemo } from "react";
import { Search, Check, Globe } from "lucide-react";
import { useListings } from "../listings-context";

export function AllScreen() {
  const {
    filteredListings,
    searchQuery,
    setSearchQuery,
    openListing,
    openSyncPreview,
    openConfirm,
    syncNow,
    notify,
    rollupSummary,
    connectListingAction,
  } = useListings();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 6 real KPIs, computed from the rollup summary
  const allKpis = useMemo(() => {
    const s = rollupSummary;
    return [
      { label: "All", value: String(s?.totalListings ?? 0), meta: "listings", tone: "neutral" },
      { label: "Connected", value: String(s?.connected ?? 0), meta: "healthy", tone: "green" },
      { label: "Needs attention", value: String(s?.needsAttention ?? 0), meta: "field mismatch", tone: "amber" },
      { label: "Disconnected", value: String(s?.disconnected ?? 0), meta: "re-auth needed", tone: "red" },
      { label: "Not connected", value: String(s?.notConnected ?? 0), meta: "no listing exists", tone: "neutral" },
      { label: "Not set up", value: String(s?.branchesWithoutMasterListing ?? 0), meta: "no Master Record", tone: "neutral" },
    ];
  }, [rollupSummary]);

  const KPI_TO_STATUS: Record<string, string> = {
    Connected: "Connected",
    "Needs attention": "Needs attention",
    Disconnected: "Disconnected",
    "Not connected": "Not connected",
  };

  const [statusFilter, setStatusFilter] = useState<string>("All statuses");
  const statusFiltered = useMemo(
    () => (statusFilter === "All statuses" ? filteredListings : filteredListings.filter((l) => l.status === statusFilter)),
    [filteredListings, statusFilter]
  );

  const exportCsv = () => {
    const rows = selectedIds.length > 0 ? statusFiltered.filter((l) => selectedIds.includes(l.id)) : statusFiltered;
    const header = ["Location", "Platform", "Status", "Completeness", "Last sync", "Mismatched fields"];
    const lines = rows.map((l) =>
      [l.location, l.platform, l.status, l.completeness, l.sync, l.mismatchedFields.join("; ")]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "listings-export.csv";
    a.click();
    URL.revokeObjectURL(url);
    notify("Export ready", `${rows.length} listing${rows.length === 1 ? "" : "s"} exported — configuration and health only, no customer data.`);
  };

  const syncSelected = () => {
    const rows = statusFiltered.filter((l) => selectedIds.includes(l.id));
    const branchIds = [...new Set(rows.map((l) => l.branchId))];
    branchIds.forEach((id) => syncNow(id));
    notify(`Sync triggered for ${branchIds.length} location${branchIds.length === 1 ? "" : "s"}`, "Results will appear in Sync & Health.");
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  };

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

  return (
    <div className="flex flex-col gap-5">
      {/* 6 Top KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {allKpis.map((k, idx) => (
          <div
            key={idx}
            onClick={() => {
              setStatusFilter(KPI_TO_STATUS[k.label] ?? "All statuses");
              notify(`Filtered to ${k.label}`, `${k.value} listing${k.value === "1" ? "" : "s"}.`);
            }}
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

      {/* Main Table Card */}
      <div className="overflow-hidden rounded-[13px] border border-[#E6E8EC] bg-white shadow-sm">
        {/* Search and Filters Header */}
        <div className="flex flex-wrap items-center gap-2 p-4">
          <div className="flex h-9 flex-1 min-w-[220px] items-center gap-2 rounded-[8px] border border-[#D5DAE2] bg-white px-3 focus-within:border-[#16A34A]">
            <Search className="h-3.5 w-3.5 text-[#7A8798]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search business, location, address, phone or listing ID…"
              className="w-full bg-transparent text-[12.5px] text-[#0F172A] placeholder-[#8B97A6] outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="flex h-9 items-center gap-1.5 rounded-[8px] border border-[#D5DAE2] bg-white px-3 text-[12.5px] font-bold text-[#45505F] hover:bg-[#F1F3F6]"
          >
            {["All statuses", "Connected", "Needs attention", "Disconnected", "Not connected"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Bulk Action Bar — the only two real bulk actions the backend supports */}
        <div className="flex flex-wrap items-center gap-2 border-y border-[#EEF0F3] bg-[#F7FDF9] px-4 py-2.5">
          <div className="flex h-4 w-4 items-center justify-center rounded border border-[#16A34A] bg-[#16A34A] text-white">
            <Check className="h-3 w-3" />
          </div>
          <span className="text-[12px] font-bold text-[#0F172A]">
            {selectedIds.length} selected
          </span>
          <div className="ml-2 flex flex-wrap gap-1.5">
            <button
              disabled={selectedIds.length === 0}
              onClick={() =>
                openConfirm({
                  title: `Sync ${selectedIds.length} selected listing${selectedIds.length === 1 ? "" : "s"}?`,
                  tone: "amber",
                  icon: "refresh-cw",
                  body: "This pushes each selected listing's location Master Record to every directory connected for that location.",
                  rows: [["Selected", `${selectedIds.length} listings`], ["Unique locations affected", String(new Set(statusFiltered.filter((l) => selectedIds.includes(l.id)).map((l) => l.branchId)).size)]],
                  primary: "Sync now",
                  cancel: "Cancel",
                  onConfirm: syncSelected,
                })
              }
              className="flex h-7 items-center rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[11.5px] font-bold text-[#45505F] hover:bg-[#F1F3F6] disabled:opacity-40"
            >
              Sync
            </button>
            <button
              onClick={exportCsv}
              className="flex h-7 items-center rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[11.5px] font-bold text-[#45505F] hover:bg-[#F1F3F6]"
            >
              Export {selectedIds.length > 0 ? "selected" : "all"}
            </button>
          </div>
          <div className="ml-auto text-[11px] text-[#94A3B8]">
            Export contains listing configuration and health only — no customer data, no platform credentials.
          </div>
        </div>

        {/* All Listings Table */}
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[1280px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E6E8EC] bg-[#FAFBFC] text-[10.5px] font-extrabold uppercase tracking-wider text-[#7A8798]">
                <th className="w-11 pl-4 py-3">
                  <div className="h-4 w-4 rounded border border-[#C3CAD4] bg-white" />
                </th>
                <th className="px-3 py-3">Platform</th>
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3">Address</th>
                <th className="px-3 py-3">Phone</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Verification</th>
                <th className="px-3 py-3">Sync</th>
                <th className="px-3 py-3 text-center">Health</th>
                <th className="pr-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {statusFiltered.map((l) => {
                const isSelected = selectedIds.includes(l.id);
                const isConflict = l.mismatchedFields.length > 0;
                return (
                  <tr
                    key={l.id}
                    onClick={() => openListing(l)}
                    className={`cursor-pointer border-b border-[#F3F4F7] transition-colors hover:bg-[#FAFBFC] ${
                      isSelected
                        ? "bg-[#F7FDF9]"
                        : l.statusTone === "red"
                        ? "bg-[#FEFBFB]"
                        : l.statusTone === "amber" || isConflict
                        ? "bg-[#FFFDF5]"
                        : "bg-white"
                    }`}
                  >
                    <td
                      className="pl-4 py-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(l.id);
                      }}
                    >
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                          isSelected
                            ? "border-[#16A34A] bg-[#16A34A] text-white"
                            : "border-[#C3CAD4] bg-white"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5 text-[#45505F]" />
                        <span className="text-[12px] font-bold text-[#0F172A] whitespace-nowrap">
                          {l.platformShort}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[12px] font-bold text-[#0F172A] whitespace-nowrap">
                      {l.location}
                    </td>
                    <td className="px-3 py-3 text-[11.5px] text-[#45505F] whitespace-nowrap">
                      {l.address}
                    </td>
                    <td className="px-3 py-3 text-[11.5px] font-mono tabular-nums whitespace-nowrap">
                      <span className={isConflict ? "font-bold text-[#B42318]" : "text-[#45505F]"}>
                        {l.phone}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[11.5px] text-[#45505F] whitespace-nowrap">
                      {l.category}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10px] font-bold ${chipClass(
                          l.statusTone
                        )}`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold ${chipClass(
                          l.verifyTone
                        )}`}
                      >
                        {l.verification}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold ${chipClass(
                          l.syncTone
                        )}`}
                      >
                        {l.sync}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold ${chipClass(
                          l.completeness === "—" ? "neutral" : parseInt(l.completeness) >= 85 ? "green" : "amber"
                        )}`}
                      >
                        {l.completeness}
                      </span>
                    </td>
                    <td className="pr-5 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (l.status === "Disconnected") {
                            openConfirm({
                              title: "Reconnect this listing?",
                              tone: "amber",
                              icon: "plug-zap",
                              body: "You will be taken to the platform to re-authorise Noxtill. Nothing queued against this listing is sent until it reconnects.",
                              rows: [
                                ["Platform", l.platform],
                                ["Location", l.location],
                                ["Public listing", "Unchanged throughout"],
                              ],
                              primary: "Reconnect on platform",
                              cancel: "Cancel",
                              onConfirm: async () => {
                                const res = await connectListingAction(l.provider, l.branchId);
                                if (res.authUrl) window.location.href = res.authUrl;
                                else notify(`Reconnected ${l.platform}`, `${l.location} is connected again.`);
                              },
                            });
                          } else if (l.status === "Not connected") {
                            openConfirm({
                              title: `Connect ${l.platform} for ${l.location}?`,
                              tone: "green",
                              icon: "plug-zap",
                              body: "You will be taken to the platform to authorise Noxtill.",
                              rows: [["Platform", l.platform], ["Location", l.location]],
                              primary: "Connect",
                              cancel: "Cancel",
                              onConfirm: async () => {
                                const res = await connectListingAction(l.provider, l.branchId);
                                if (res.authUrl) window.location.href = res.authUrl;
                                else notify(`Connected ${l.platform}`, `${l.location} is now connected.`);
                              },
                            });
                          } else {
                            openSyncPreview(l);
                          }
                        }}
                        className={`inline-flex h-[30px] items-center rounded-[8px] px-2.5 text-[12px] font-bold transition-colors ${
                          l.status === "Disconnected" || isConflict
                            ? "bg-[#16A34A] text-white hover:bg-[#15803D]"
                            : "border border-[#D5DAE2] bg-white text-[#45505F] hover:bg-[#F1F3F6]"
                        }`}
                      >
                        {l.status === "Disconnected"
                          ? "Reconnect"
                          : l.status === "Not connected"
                          ? "Connect"
                          : isConflict
                          ? "Resolve"
                          : "Sync"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Note */}
        <div className="border-t border-[#EEF0F3] bg-[#FCFCFD] p-3 px-5 text-[11px] text-[#94A3B8]">
          Any row opens the same 13-section listing workspace. A disconnected listing shows unavailable rather than its last known values.
        </div>
      </div>
    </div>
  );
}
