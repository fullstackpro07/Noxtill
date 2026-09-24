"use client";

import React, { useState } from "react";
import { Clock3, AlertTriangle, CheckCircle2, AlertCircle, Pencil, X } from "lucide-react";
import { useListings } from "../listings-context";

export function ProfileScreen() {
  const { masterListing, citations, services, updateMaster, openConfirm, notify } = useListings();

  const bizName = masterListing?.name || "";
  const canonicalPhone = masterListing?.phone || "";
  const canonicalAddress = masterListing?.addressLine1 || "";
  const canonicalWebsite = masterListing?.website || "";
  const canonicalCategory = masterListing?.categories?.[0] || "";
  const description = masterListing?.description || "";

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    name: bizName,
    phone: canonicalPhone,
    website: canonicalWebsite,
    addressLine1: canonicalAddress,
    category: canonicalCategory,
    description,
  });
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = () => {
    setForm({
      name: bizName,
      phone: canonicalPhone,
      website: canonicalWebsite,
      addressLine1: canonicalAddress,
      category: canonicalCategory,
      description,
    });
    setIsEditing(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      notify("Business name is required", "Enter a name before saving.");
      return;
    }
    setIsSaving(true);
    try {
      await updateMaster({
        name: form.name,
        phone: form.phone || undefined,
        website: form.website || undefined,
        addressLine1: form.addressLine1 || undefined,
        categories: form.category ? [form.category] : undefined,
        description: form.description || undefined,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const chipClass = (tone: string) => {
    switch (tone) {
      case "green":
        return "bg-[#ECFDF3] border-[#BBF0CB] text-[#15803D]";
      case "amber":
        return "bg-[#FFFBEB] border-[#FDE49B] text-[#B45309]";
      case "red":
        return "bg-[#FEF3F2] border-[#FBD5D2] text-[#B42318]";
      default:
        return "bg-[#F1F3F6] border-[#E1E5EB] text-[#45505F]";
    }
  };

  // Real per-provider match status from the citation audit — no fabricated external values, since
  // Noxtill only stores whether a snapshot's fields matched, not the platform's actual live value.
  const napByProvider = citations.map((c) => ({
    provider: c.provider,
    matches: c.matches,
    mismatchedFields: c.mismatchedFields,
  }));

  const hasAnyMismatch = napByProvider.some((c) => !c.matches);

  // Real hours from the Master Record — no invented fallback schedule.
  const hoursRows = React.useMemo(() => {
    const days: [string, string][] = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
    const h = (masterListing?.hours || {}) as Record<string, [string, string][]>;
    return days.map(([key, label]) => {
      const ranges = h[key];
      return { day: label, hours: ranges && ranges.length > 0 ? ranges.map((r) => `${r[0]} – ${r[1]}`).join(", ") : "Not set", tone: ranges && ranges.length > 0 ? "green" : "neutral" };
    });
  }, [masterListing]);
  const hasSpecialHours = Boolean(masterListing?.hours && (masterListing.hours as Record<string, unknown>).special);

  // Real completeness — same fields ListingsRollupService counts, computed here for display.
  const completenessRows = React.useMemo(() => {
    const hasName = Boolean(masterListing?.name);
    const hasAddress = Boolean(masterListing?.addressLine1);
    const hasPhone = Boolean(masterListing?.phone);
    const hasWebsite = Boolean(masterListing?.website);
    const descLength = masterListing?.description?.length || 0;
    const hasHours = hoursRows.some((h) => h.tone === "green");

    return [
      { field: "Business name", detail: hasName ? "Set" : "Missing", state: hasName ? "Complete" : "Missing", tone: hasName ? "green" : "red" },
      { field: "Address", detail: hasAddress ? "Set" : "Missing", state: hasAddress ? "Complete" : "Missing", tone: hasAddress ? "green" : "red" },
      { field: "Phone", detail: hasPhone ? (hasAnyMismatch ? "Set, but disagrees with a connected directory" : "Set") : "Missing", state: hasPhone ? (hasAnyMismatch ? "Mismatch" : "Complete") : "Missing", tone: hasPhone ? (hasAnyMismatch ? "amber" : "green") : "red" },
      { field: "Website", detail: hasWebsite ? "Set" : "Not set", state: hasWebsite ? "Complete" : "Optional", tone: hasWebsite ? "green" : "amber" },
      { field: "Description", detail: descLength > 0 ? `${descLength} characters` : "Not written yet", state: descLength > 0 ? "Complete" : "Missing", tone: descLength > 0 ? "green" : "amber" },
      { field: "Regular hours", detail: hasHours ? "At least one day configured" : "Not set", state: hasHours ? "Complete" : "Missing", tone: hasHours ? "green" : "red" },
      { field: "Special hours", detail: hasSpecialHours ? "Configured" : "None set", state: hasSpecialHours ? "Complete" : "Optional", tone: hasSpecialHours ? "green" : "amber" },
      { field: "Services in catalog", detail: `${services.length} service${services.length === 1 ? "" : "s"}`, state: services.length > 0 ? "Complete" : "None yet", tone: services.length > 0 ? "green" : "amber" },
    ];
  }, [masterListing, hoursRows, hasAnyMismatch, services]);

  const completenessPct = Math.round(
    (completenessRows.filter((r) => r.tone === "green").length / completenessRows.length) * 100
  );
  const gapsCount = completenessRows.filter((r) => r.tone !== "green").length;

  return (
    <div className="flex flex-col gap-5">
      {/* Business Profile Top Card */}
      <div className="rounded-[13px] border border-[#E6E8EC] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-3.5">
          <div className="flex h-13 w-13 flex-shrink-0 items-center justify-center rounded-[12px] bg-[#16A34A] text-[20px] font-extrabold text-white">
            {bizName ? bizName[0].toUpperCase() : "?"}
          </div>
          <div className="min-w-[220px] flex-1">
            <h2 className="text-[17px] font-extrabold tracking-tight text-[#0F172A]">
              {bizName || "No Master Record set up yet"}
            </h2>
            <div className="mt-0.5 text-[11.5px] text-[#7A8798]">
              {[canonicalCategory, canonicalAddress, canonicalWebsite].filter(Boolean).join(" · ") || "Fill in your profile to see it here"}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold ${chipClass(completenessPct >= 85 ? "green" : "amber")}`}>
                Completeness {completenessPct}%
              </span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold ${chipClass(hasAnyMismatch ? "amber" : "green")}`}>
                NAP: {hasAnyMismatch ? `${napByProvider.filter((c) => !c.matches).length} mismatch` : "All match"}
              </span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold ${chipClass("green")}`}>
                Canonical source
              </span>
            </div>
          </div>
          <button
            onClick={startEditing}
            className="flex h-[30px] items-center gap-1.5 rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold text-[#0F172A] hover:bg-[#F1F3F6]"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Edit profile</span>
          </button>
        </div>

        {isEditing && (
          <div className="mt-4 border-t border-[#EEF0F3] pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11.5px] font-bold text-[#5B6675]">
                Business name
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-9 rounded-[8px] border border-[#D5DAE2] px-3 text-[12.5px] text-[#0F172A]" />
              </label>
              <label className="flex flex-col gap-1 text-[11.5px] font-bold text-[#5B6675]">
                Phone
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="h-9 rounded-[8px] border border-[#D5DAE2] px-3 text-[12.5px] text-[#0F172A]" />
              </label>
              <label className="flex flex-col gap-1 text-[11.5px] font-bold text-[#5B6675]">
                Website
                <input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} className="h-9 rounded-[8px] border border-[#D5DAE2] px-3 text-[12.5px] text-[#0F172A]" />
              </label>
              <label className="flex flex-col gap-1 text-[11.5px] font-bold text-[#5B6675]">
                Address
                <input value={form.addressLine1} onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))} className="h-9 rounded-[8px] border border-[#D5DAE2] px-3 text-[12.5px] text-[#0F172A]" />
              </label>
              <label className="flex flex-col gap-1 text-[11.5px] font-bold text-[#5B6675]">
                Category
                <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="h-9 rounded-[8px] border border-[#D5DAE2] px-3 text-[12.5px] text-[#0F172A]" />
              </label>
              <label className="flex flex-col gap-1 text-[11.5px] font-bold text-[#5B6675] sm:col-span-2">
                Description
                <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="rounded-[8px] border border-[#D5DAE2] px-3 py-2 text-[12.5px] text-[#0F172A]" />
              </label>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setIsEditing(false)} className="flex h-9 items-center gap-1.5 rounded-[8px] border border-[#D5DAE2] bg-white px-3 text-[12.5px] font-bold text-[#45505F] hover:bg-[#F1F3F6]">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button disabled={isSaving} onClick={save} className="flex h-9 items-center rounded-[8px] bg-[#16A34A] px-4 text-[12.5px] font-bold text-white hover:bg-[#15803D] disabled:opacity-60">
                {isSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
            <div className="mt-2 text-[11px] text-[#94A3B8]">
              Changes are saved to your Master Record only. Push them to connected directories from Sync &amp; Health.
            </div>
          </div>
        )}
      </div>

      {/* NAP Consistency — real per-provider match status only, no invented external values */}
      <div className="overflow-hidden rounded-[13px] border border-[#E6E8EC] bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EEF0F3] p-4">
          <div className="text-[13.5px] font-extrabold text-[#0F172A]">NAP consistency</div>
          <div className="text-[11px] text-[#94A3B8]">Your Master Record is the reference; compared against each directory's last-synced snapshot</div>
        </div>

        {napByProvider.length === 0 ? (
          <div className="p-6 text-center text-[12.5px] text-[#94A3B8]">No directory has been synced yet — sync at least once to see a comparison here.</div>
        ) : (
          <div>
            {napByProvider.map((c, idx) => (
              <div key={idx} className={`flex flex-wrap items-center gap-2.5 px-4 py-3 text-[12px] ${idx > 0 ? "border-t border-[#F3F4F7]" : ""} ${!c.matches ? "bg-[#FEFBFB]" : "bg-white"}`}>
                <span className="font-bold text-[#0F172A]">{c.provider.replace(/_/g, " ")}</span>
                <span className="text-[#45505F]">{c.matches ? "Matches your Master Record" : `Disagrees on: ${c.mismatchedFields.join(", ")}`}</span>
                <span className={`ml-auto inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold ${chipClass(c.matches ? "green" : "red")}`}>
                  {c.matches ? "Match" : "Mismatch"}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-[#EEF0F3] bg-[#FCFCFD] p-3 px-4 text-[11px] text-[#94A3B8]">
          This compares against the last-synced snapshot, not a live read of the directory — sync again after fixing a value to confirm it.
        </div>
      </div>

      {/* 2-Column Grid: Hours & Completeness */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Opening Hours */}
        <div className="overflow-hidden rounded-[13px] border border-[#E6E8EC] bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-[#EEF0F3] p-4">
            <Clock3 className="h-4 w-4 text-[#45505F]" />
            <span className="text-[13.5px] font-extrabold text-[#0F172A]">Opening hours</span>
          </div>

          <div>
            {hoursRows.map((hr, idx) => (
              <div
                key={idx}
                className={`flex items-center px-4 py-2.5 text-[12px] ${idx > 0 ? "border-t border-[#F3F4F7]" : ""}`}
              >
                <span className="w-2/5 font-bold text-[#0F172A]">{hr.day}</span>
                <span className={`flex-1 text-right font-bold ${hr.tone === "neutral" ? "text-[#94A3B8]" : "text-[#0F172A]"}`}>
                  {hr.hours}
                </span>
              </div>
            ))}
          </div>

          {!hasSpecialHours && (
            <div className="flex flex-wrap items-center gap-2.5 border-t border-[#EEF0F3] bg-[#FFFBEB] p-3 px-4">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[#B45309]" />
              <div className="min-w-[180px] flex-1 text-[11.5px] leading-relaxed text-[#B45309]">
                No special hours set. Customers will see your normal hours on every holiday or closure.
              </div>
              <button
                onClick={() =>
                  openConfirm({
                    title: "Mark today's date as a special closure?",
                    tone: "amber",
                    icon: "clock-3",
                    body: "This is a minimal special-hours entry — it marks one date as closed. Sync afterwards to push it to connected directories that support special hours.",
                    rows: [["Date", new Date().toLocaleDateString()], ["Hours", "Closed"]],
                    primary: "Save",
                    cancel: "Cancel",
                    onConfirm: async () => {
                      const existingHours = (masterListing?.hours || {}) as Record<string, unknown>;
                      const nextHours = { ...existingHours, special: { [new Date().toISOString().slice(0, 10)]: "closed" } };
                      await updateMaster({
                        name: bizName || "Business",
                        hours: nextHours as unknown as Record<string, [string, string][]>,
                      });
                      notify("Special hours saved", "Sync from Sync & Health to push this to connected directories.");
                    },
                  })
                }
                className="flex h-[30px] items-center rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold text-[#0F172A] hover:bg-[#F1F3F6]"
              >
                Add special hours
              </button>
            </div>
          )}
        </div>

        {/* Profile Completeness */}
        <div className="overflow-hidden rounded-[13px] border border-[#E6E8EC] bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-[#EEF0F3] p-4">
            <CheckCircle2 className="h-4 w-4 text-[#45505F]" />
            <span className="text-[13.5px] font-extrabold text-[#0F172A]">Profile completeness</span>
            <span className="ml-auto text-[11px] text-[#94A3B8]">{completenessPct}% · {gapsCount} gap{gapsCount === 1 ? "" : "s"}</span>
          </div>

          <div>
            {completenessRows.map((cr, idx) => (
              <div
                key={idx}
                onClick={() => notify(`${cr.field} · ${cr.state}`, cr.detail)}
                className={`flex cursor-pointer items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-[#FAFBFC] ${
                  idx > 0 ? "border-t border-[#F3F4F7]" : ""
                } ${cr.tone === "red" ? "bg-[#FEFBFB]" : "bg-white"}`}
              >
                {cr.tone === "green" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-[#15803D]" />
                ) : cr.tone === "red" ? (
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-[#B42318]" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-[#B45309]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-[#0F172A]">{cr.field}</div>
                  <div className="text-[10.5px] text-[#94A3B8]">{cr.detail}</div>
                </div>
                <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold ${chipClass(cr.tone)}`}>
                  {cr.state}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
