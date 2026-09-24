"use client";

import React, { useState } from "react";
import { Image as ImageIcon, Plus, X } from "lucide-react";
import { useListings } from "../listings-context";
import type { ListingPhotoCategory } from "@/lib/listing-photos-api";

const CATEGORIES: ListingPhotoCategory[] = ["exterior", "interior", "team", "products", "logo"];

export function PhotosScreen() {
  const { listingPhotos, gmbPhotos, openPanel, notify, addPhotoAction, removePhotoAction, pushPhotoAction } = useListings();

  const [isAdding, setIsAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<ListingPhotoCategory>("exterior");
  const [isSaving, setIsSaving] = useState(false);

  const chipClass = (tone: string) => {
    switch (tone) {
      case "green":
        return "bg-[#ECFDF3] border-[#BBF0CB] text-[#15803D]";
      case "amber":
        return "bg-[#FFFBEB] border-[#FDE49B] text-[#B45309]";
      case "neutral":
      default:
        return "bg-[#F1F3F6] border-[#E1E5EB] text-[#45505F]";
    }
  };

  const totalPhotos = listingPhotos.length + gmbPhotos.length;
  const pushedCount = listingPhotos.filter((p) => p.pushedProviders.length > 0).length;
  const unpushedCount = listingPhotos.length - pushedCount;

  // Real KPIs only — no fabricated fallback numbers, no invented quality/alt-text metrics
  const mediaKpis = [
    { label: "Total media", value: String(totalPhotos), meta: `${listingPhotos.length} uploaded · ${gmbPhotos.length} via Google`, tone: "neutral" },
    { label: "Pushed to a directory", value: String(pushedCount), meta: "of your uploaded photos", tone: "green" },
    { label: "Not pushed yet", value: String(unpushedCount), meta: unpushedCount > 0 ? "not sent to any directory" : "all pushed", tone: unpushedCount > 0 ? "amber" : "green" },
  ];

  const handleAdd = async () => {
    if (!url.trim()) {
      notify("A URL is required", "Paste a real image URL to add it.");
      return;
    }
    setIsSaving(true);
    try {
      await addPhotoAction({ url: url.trim(), category });
      setUrl("");
      setIsAdding(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Real Media KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {mediaKpis.map((k, idx) => (
          <div
            key={idx}
            onClick={() => notify(`${k.label} · ${k.value}`, k.meta)}
            className={`cursor-pointer rounded-[12px] border bg-white p-3.5 shadow-sm transition-all hover:border-[#CBD5E1] ${
              k.tone === "amber" ? "border-[#FDE49B]" : "border-[#E6E8EC]"
            }`}
          >
            <div className="text-[11.5px] font-bold text-[#5B6675]">{k.label}</div>
            <div className={`mt-1.5 text-[19px] font-extrabold tracking-tight ${k.tone === "amber" ? "text-[#B45309]" : "text-[#0F172A]"}`}>
              {k.value}
            </div>
            <div className="mt-1 text-[10.5px] text-[#94A3B8]">{k.meta}</div>
          </div>
        ))}
      </div>

      {/* Media Library Card — real uploaded photos only */}
      <div className="rounded-[13px] border border-[#E6E8EC] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="text-[14px] font-extrabold text-[#0F172A]">Media library</div>
          <button
            onClick={() => setIsAdding((v) => !v)}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold text-[#45505F] hover:bg-[#F1F3F6]"
          >
            {isAdding ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            <span>{isAdding ? "Cancel" : "Add photo"}</span>
          </button>
        </div>

        {isAdding && (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-[12px] border border-[#E6E8EC] bg-[#FAFBFC] p-3">
            <label className="flex flex-1 min-w-[220px] flex-col gap-1 text-[11px] font-bold text-[#5B6675]">
              Image URL
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="h-9 rounded-[8px] border border-[#D5DAE2] px-3 text-[12.5px] text-[#0F172A]" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[#5B6675]">
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value as ListingPhotoCategory)} className="h-9 rounded-[8px] border border-[#D5DAE2] px-2 text-[12.5px] text-[#0F172A]">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <button disabled={isSaving} onClick={handleAdd} className="flex h-9 items-center rounded-[8px] bg-[#16A34A] px-3 text-[12.5px] font-bold text-white hover:bg-[#15803D] disabled:opacity-60">
              {isSaving ? "Adding…" : "Add"}
            </button>
          </div>
        )}

        {/* Gallery Grid */}
        {listingPhotos.length === 0 && gmbPhotos.length === 0 ? (
          <div className="mt-4 rounded-[12px] border border-dashed border-[#D5DAE2] p-10 text-center text-[12.5px] text-[#94A3B8]">
            No photos on record yet. Add one above, or connect Google Business Profile to pull its photos in.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4">
            {listingPhotos.map((p) => (
              <div
                key={p.id}
                onClick={() =>
                  openPanel({
                    kicker: "Photo",
                    title: p.category,
                    badge: p.pushedProviders.length > 0 ? `Pushed to ${p.pushedProviders.length}` : "Not pushed",
                    badgeTone: p.pushedProviders.length > 0 ? "green" : "amber",
                    rows: [
                      ["Category", p.category],
                      ["Added", new Date(p.createdAt).toLocaleDateString()],
                      ["Pushed to", p.pushedProviders.length > 0 ? p.pushedProviders.join(", ") : "No directory yet"],
                      ["URL", p.url],
                    ],
                    bulletsTitle: "What Noxtill checks",
                    bullets: [
                      "Noxtill does not run automated image-quality scoring — that would be a fabricated check",
                      "Pushing sends this photo to every connected directory that supports photo uploads",
                    ],
                    note: "Noxtill does not fabricate a quality score for uploaded media. Use the Remove link on the photo's card to delete it.",
                    primary: "Push to connected directories",
                    secondary: "Close",
                    primaryTone: "green",
                    onPrimary: async () => {
                      await pushPhotoAction(p.id);
                    },
                  })
                }
                className="cursor-pointer overflow-hidden rounded-[12px] border border-[#E6E8EC] bg-white shadow-sm transition-all hover:border-[#16A34A]"
              >
                <div className="relative flex h-24 items-center justify-center overflow-hidden border-b border-[#EEF0F3] bg-[repeating-linear-gradient(135deg,#F5F6F8_0_6px,#EEF0F3_6px_12px)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.category} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <ImageIcon className="absolute h-6 w-6 text-[#94A3B8]" />
                  <span className={`absolute left-2 top-2 inline-flex h-5 items-center rounded-full border px-2 text-[9px] font-bold ${chipClass(p.pushedProviders.length > 0 ? "green" : "amber")}`}>
                    {p.pushedProviders.length > 0 ? `Pushed · ${p.pushedProviders.length}` : "Not pushed"}
                  </span>
                </div>
                <div className="p-3">
                  <div className="truncate text-[12px] font-bold capitalize text-[#0F172A]">{p.category}</div>
                  <div className="mt-1 text-[10px] text-[#94A3B8]">Added {new Date(p.createdAt).toLocaleDateString()}</div>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await removePhotoAction(p.id);
                    }}
                    className="mt-2 text-[10.5px] font-bold text-[#B42318] hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {gmbPhotos.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-[12px] border border-[#E6E8EC] bg-white shadow-sm opacity-90">
                <div className="relative flex h-24 items-center justify-center overflow-hidden border-b border-[#EEF0F3] bg-[repeating-linear-gradient(135deg,#F5F6F8_0_6px,#EEF0F3_6px_12px)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.category || "Google photo"} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <ImageIcon className="absolute h-6 w-6 text-[#94A3B8]" />
                  <span className="absolute left-2 top-2 inline-flex h-5 items-center rounded-full border px-2 text-[9px] font-bold bg-[#EFF6FF] border-[#C7DBFE] text-[#1D4ED8]">
                    Via Google
                  </span>
                </div>
                <div className="p-3">
                  <div className="truncate text-[12px] font-bold text-[#0F172A]">{p.category || "Photo"}</div>
                  <div className="mt-1 text-[10px] text-[#94A3B8]">Added {new Date(p.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
