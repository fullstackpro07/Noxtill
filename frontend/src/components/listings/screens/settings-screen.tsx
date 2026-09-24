"use client";

import React, { useState } from "react";
import {
  PlugZap,
  RefreshCw,
  Contact,
  Images,
  Bell,
  Sparkles,
} from "lucide-react";
import { useListings } from "../listings-context";

export function SettingsScreen() {
  const { settings, liveStatuses, masterListing, updateListingSettingsAction } = useListings();

  const chipClass = (value: string) => {
    switch (value) {
      case "Needs attention":
      case "Pending":
        return "bg-[#FFFBEB] border-[#FDE49B] text-[#B45309]";
      case "Not connected":
        return "bg-[#F1F3F6] border-[#E1E5EB] text-[#45505F]";
      case "On":
      case "Connected":
        return "bg-[#ECFDF3] border-[#BBF0CB] text-[#15803D]";
      case "Required":
        return "bg-[#EFF6FF] border-[#C7DBFE] text-[#1D4ED8]";
      default:
        return "bg-[#F1F3F6] border-[#E1E5EB] text-[#45505F]";
    }
  };

  const [isSavingSync, setIsSavingSync] = useState(false);

  const toggleAutoSync = async () => {
    setIsSavingSync(true);
    try {
      await updateListingSettingsAction({ autoSyncEnabled: !settings?.autoSyncEnabled });
    } finally {
      setIsSavingSync(false);
    }
  };

  const setFrequency = async (hours: number) => {
    setIsSavingSync(true);
    try {
      await updateListingSettingsAction({ autoSyncFrequencyHours: hours });
    } finally {
      setIsSavingSync(false);
    }
  };

  const setConflictResolution = async (mode: "master_wins" | "directory_wins") => {
    setIsSavingSync(true);
    try {
      await updateListingSettingsAction({ conflictResolution: mode });
    } finally {
      setIsSavingSync(false);
    }
  };

  const connectionItems = [
    { label: "Google Business Profile", value: liveStatuses?.gmb === "connected" ? "Connected" : "Not connected" },
    { label: "Bing Places", value: liveStatuses?.bing_places === "connected" ? "Connected" : "Not connected" },
    { label: "Apple Business Connect", value: liveStatuses?.apple_business_connect === "connected" ? "Connected" : "Not connected" },
    { label: "Yelp", value: liveStatuses?.yelp === "connected" ? "Connected" : "Not connected" },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 items-start">
      {/* Account connections — real status, from Integrations */}
      <div className="rounded-[13px] border border-[#E6E8EC] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <PlugZap className="h-4 w-4 text-[#15803D]" />
          <h3 className="text-[13.5px] font-extrabold text-[#0F172A]">Account connections</h3>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          {connectionItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2.5 rounded-[8px] p-2.5">
              <div className="min-w-0 flex-1 text-[12.5px] font-bold text-[#0F172A]">{item.label}</div>
              <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold ${chipClass(item.value)}`}>{item.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-[#EEF0F3] pt-3 text-[10.5px] leading-relaxed text-[#94A3B8]">
          Only platforms Noxtill genuinely integrates with appear here. Connect or disconnect them from a listing row in All Listings.
        </div>
      </div>

      {/* Sync — real, editable settings from ListingSettings */}
      <div className="rounded-[13px] border border-[#E6E8EC] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-[#15803D]" />
          <h3 className="text-[13.5px] font-extrabold text-[#0F172A]">Sync</h3>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold text-[#0F172A]">Auto sync</div>
              <div className="mt-0.5 text-[10.5px] text-[#94A3B8]">Push automatically on a schedule, instead of only when you sync manually</div>
            </div>
            <button
              disabled={isSavingSync}
              onClick={toggleAutoSync}
              className={`inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60 ${settings?.autoSyncEnabled ? "bg-[#16A34A]" : "bg-[#D5DAE2]"}`}
            >
              <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${settings?.autoSyncEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1 text-[12.5px] font-bold text-[#0F172A]">Auto sync frequency</div>
            <select
              value={settings?.autoSyncFrequencyHours ?? 24}
              onChange={(e) => setFrequency(Number(e.target.value))}
              disabled={!settings?.autoSyncEnabled || isSavingSync}
              className="h-8 rounded-[8px] border border-[#D5DAE2] px-2 text-[12px] font-bold text-[#0F172A] disabled:opacity-50"
            >
              {[1, 4, 12, 24, 168].map((h) => (
                <option key={h} value={h}>{h === 168 ? "Weekly" : `Every ${h}h`}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1 text-[12.5px] font-bold text-[#0F172A]">On conflict</div>
            <select
              value={settings?.conflictResolution ?? "master_wins"}
              onChange={(e) => setConflictResolution(e.target.value as "master_wins" | "directory_wins")}
              disabled={isSavingSync}
              className="h-8 rounded-[8px] border border-[#D5DAE2] px-2 text-[12px] font-bold text-[#0F172A] disabled:opacity-50"
            >
              <option value="master_wins">Master Record wins</option>
              <option value="directory_wins">Directory wins</option>
            </select>
          </div>
        </div>
        <div className="mt-3 border-t border-[#EEF0F3] pt-3 text-[10.5px] leading-relaxed text-[#94A3B8]">
          Field-level exclusions (which fields are sent per platform) are configured from Sync &amp; Health.
        </div>
      </div>

      {/* Canonical profile — real values only */}
      <div className="rounded-[13px] border border-[#E6E8EC] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Contact className="h-4 w-4 text-[#15803D]" />
          <h3 className="text-[13.5px] font-extrabold text-[#0F172A]">Canonical profile</h3>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          {[
            { label: "Business name", value: masterListing?.name || "Not set" },
            { label: "Address", value: masterListing?.addressLine1 || "Not set" },
            { label: "Phone", value: masterListing?.phone || "Not set" },
            { label: "Website", value: masterListing?.website || "Not set" },
            { label: "Default category", value: masterListing?.categories?.[0] || "Not set" },
          ].map((item, idx) => (
            <div key={idx} className="flex items-center gap-2.5 rounded-[8px] p-2.5">
              <div className="min-w-0 flex-1 text-[12.5px] font-bold text-[#0F172A]">{item.label}</div>
              <span className="text-[11.5px] text-[#45505F]">{item.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-[#EEF0F3] pt-3 text-[10.5px] leading-relaxed text-[#94A3B8]">
          Edit this in Business Profile — Listings Settings only reads it.
        </div>
      </div>

      {/* Posts and media — fixed platform behaviour, not a configurable toggle system */}
      <div className="rounded-[13px] border border-[#E6E8EC] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Images className="h-4 w-4 text-[#15803D]" />
          <h3 className="text-[13.5px] font-extrabold text-[#0F172A]">Posts and media</h3>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          {[
            { label: "Post approval", meta: "Every post is saved as a draft and only goes live when you publish it" },
            { label: "Auto publish", meta: "Off — nothing publishes externally without you clicking Publish" },
            { label: "Photo quality scoring", meta: "Not implemented — Noxtill does not fabricate an image quality score" },
          ].map((item, idx) => (
            <div key={idx} className="flex items-center gap-2.5 rounded-[8px] p-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-bold text-[#0F172A]">{item.label}</div>
                <div className="mt-0.5 text-[10.5px] leading-relaxed text-[#94A3B8]">{item.meta}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-[#EEF0F3] pt-3 text-[10.5px] leading-relaxed text-[#94A3B8]">
          These describe fixed platform behaviour — there is nothing here to toggle yet.
        </div>
      </div>

      {/* Monitoring and alerts — honest disclosure, no fabricated alert system */}
      <div className="rounded-[13px] border border-[#E6E8EC] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-[#15803D]" />
          <h3 className="text-[13.5px] font-extrabold text-[#0F172A]">Monitoring and alerts</h3>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <div className="rounded-[8px] p-2.5 text-[12.5px] leading-relaxed text-[#45505F]">
            There is no in-app or notification-based alert system for listing issues yet — field mismatches, disconnections and missing hours are surfaced when you open Overview, All Listings or Sync &amp; Health, not pushed to you proactively.
          </div>
        </div>
        <div className="mt-3 border-t border-[#EEF0F3] pt-3 text-[10.5px] leading-relaxed text-[#94A3B8]">
          Disclosed as unavailable rather than shown as a configured toggle you can't actually change.
        </div>
      </div>

      {/* AI governance — a real, firm policy statement */}
      <div className="rounded-[13px] border border-[#E6E8EC] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#15803D]" />
          <h3 className="text-[13.5px] font-extrabold text-[#0F172A]">AI governance</h3>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          {[
            { label: "AI may prepare", meta: "A sync, with a change preview you approve", value: "Allowed" },
            { label: "AI may write externally", meta: "Never without your approval", value: "Restricted" },
          ].map((item, idx) => (
            <div key={idx} className="flex items-center gap-2.5 rounded-[8px] p-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-bold text-[#0F172A]">{item.label}</div>
                <div className="mt-0.5 text-[10.5px] leading-relaxed text-[#94A3B8]">{item.meta}</div>
              </div>
              <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold ${chipClass(item.value)}`}>{item.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-[#EEF0F3] pt-3 text-[10.5px] leading-relaxed text-[#94A3B8]">
          An unapproved external profile change could misinform customers, so this boundary is not configurable.
        </div>
      </div>
    </div>
  );
}
