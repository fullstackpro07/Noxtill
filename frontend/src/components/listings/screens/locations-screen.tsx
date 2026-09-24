"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, ExternalLink, MapPin, Globe } from "lucide-react";
import { useListings } from "../listings-context";

export function LocationsScreen() {
  const router = useRouter();
  const {
    branches,
    listings,
    openPanel,
  } = useListings();

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

  const locationCards = useMemo(() => {
    // One card per real branch — every branch is guaranteed a row here since `listings` already
    // has one entry per (branch x provider) for the whole real branch group.
    const branchIds = [...new Set(listings.map((l) => l.branchId))];
    const idsToUse = branchIds.length > 0 ? branchIds : branches.map((b) => b.id);

    return idsToUse.map((id) => {
      const branchListings = listings.filter((l) => l.branchId === id);
      const branch = branches.find((b) => b.id === id);
      const name = branchListings[0]?.location || branch?.name || "Location";
      const avg = branchListings[0]?.completenessPercent ?? null;
      const hasDisconnected = branchListings.some((l) => l.status === "Disconnected");
      const tone = hasDisconnected ? "red" : avg != null && avg >= 85 ? "green" : avg != null ? "amber" : "neutral";
      const mismatchCount = branchListings.reduce((sum, l) => sum + l.mismatchedFields.length, 0);
      const connectedCount = branchListings.filter((l) => l.status === "Connected" || l.status === "Needs attention").length;

      const platforms = branchListings.map((l) => ({
        label: l.platformShort,
        tone: l.status === "Disconnected" ? "red" : l.status === "Needs attention" ? "amber" : l.status === "Connected" ? "green" : "neutral",
      }));

      return {
        id,
        name,
        address: branchListings[0]?.address || "Address not configured",
        health: avg != null ? `${avg}%` : "—",
        tone,
        platforms,
        stats: [
          { label: "Connected", value: `${connectedCount} of ${branchListings.length}` },
          { label: "Mismatches", value: String(mismatchCount) },
          { label: "Photos", value: String(branchListings[0]?.photoCount ?? 0) },
          { label: "Not connected", value: String(branchListings.filter((l) => l.status === "Not connected").length) },
        ],
      };
    });
  }, [branches, listings]);

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-[12px] border border-[#E6E8EC] bg-white p-4 shadow-sm">
        <Info className="h-4 w-4 flex-shrink-0 text-[#7A8798]" />
        <div className="min-w-[220px] flex-1 text-[11.5px] leading-relaxed text-[#5B6675]">
          Branch records live in the Branches module. This screen references them and adds the listing layer on top — nothing is duplicated.
        </div>
        <Link
          href="/branches"
          className="flex h-[30px] items-center gap-1.5 rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold text-[#0F172A] hover:bg-[#F1F3F6]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Open Branches</span>
        </Link>
      </div>

      {/* Location Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {locationCards.map((lc) => (
          <div
            key={lc.id}
            onClick={() =>
              openPanel({
                kicker: "Location",
                title: lc.name,
                badge: lc.health === "—" ? "Health unavailable" : `Health ${lc.health}`,
                badgeTone: (["green", "amber", "red", "blue", "neutral"].includes(lc.tone)
                  ? lc.tone
                  : "neutral") as "green" | "amber" | "red" | "blue" | "neutral",
                rows: [
                  ["Address", lc.address],
                  ["Branch record", "Owned by Branches module"],
                  ["Connected directories", lc.stats[0].value],
                  ["Field mismatches", lc.stats[1].value],
                  ["Photos", lc.stats[2].value],
                  ["Not connected", lc.stats[3].value],
                  ["Completeness", lc.health === "—" ? "No Master Record set up yet" : lc.health],
                ],
                bulletsTitle:
                  lc.health === "—"
                    ? "Why completeness is unavailable"
                    : "What contributes to completeness",
                bullets:
                  lc.health === "—"
                    ? [
                        "No Master Business Record has been set up for this location yet",
                        "Noxtill shows unavailable rather than carrying forward a stale figure",
                        "The public listing, where one exists, is unaffected",
                      ]
                    : [
                        "Name, phone, address, website, description, category, hours and at least one photo",
                        "Each is a named field check, not a weighting",
                        "The branch record in Branches is the reference for every comparison",
                      ],
                note: "This screen references branch records. It never duplicates them.",
                primary: lc.health === "—" ? "Set up Master Record" : "Open listings",
                secondary: "Close",
                onPrimary: () => {
                  if (lc.health === "—") {
                    router.push("/listings/profile");
                  } else {
                    router.push("/listings/all");
                  }
                },
              })
            }
            className={`cursor-pointer rounded-[13px] border bg-white p-4 shadow-sm transition-all hover:border-[#CBD5E1] hover:shadow-md ${
              lc.tone === "red"
                ? "border-[#FBD5D2]"
                : lc.tone === "amber"
                ? "border-[#FDE49B]"
                : lc.tone === "neutral"
                ? "border-[#E6E8EC]"
                : "border-[#BBF0CB]"
            }`}
          >
            {/* Card Header */}
            <div className="flex items-start gap-2.5">
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] ${
                  lc.tone === "red"
                    ? "bg-[#FEE4E2] text-[#B42318]"
                    : lc.tone === "amber"
                    ? "bg-[#FEF3C7] text-[#B45309]"
                    : lc.tone === "neutral"
                    ? "bg-[#F1F3F6] text-[#94A3B8]"
                    : "bg-[#ECFDF3] text-[#15803D]"
                }`}
              >
                <MapPin className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-extrabold text-[#0F172A]">{lc.name}</div>
                <div className="mt-0.5 text-[11px] text-[#94A3B8]">{lc.address}</div>
              </div>
              <span
                className={`inline-flex h-5 items-center rounded-full border px-2 text-[10.5px] font-bold ${chipClass(
                  lc.tone
                )}`}
              >
                {lc.health}
              </span>
            </div>

            {/* Platform Badges */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {lc.platforms.length > 0 ? (
                lc.platforms.map((p, pIdx) => (
                  <span
                    key={pIdx}
                    className={`inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10px] font-bold ${chipClass(
                      p.tone
                    )}`}
                  >
                    <Globe className="h-2.5 w-2.5" />
                    <span>{p.label}</span>
                  </span>
                ))
              ) : (
                <span
                  className={`inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10px] font-bold ${chipClass(
                    "neutral"
                  )}`}
                >
                  No listing yet
                </span>
              )}
            </div>

            {/* Stats Grid */}
            <div className="mt-3.5 grid grid-cols-4 gap-2 border-t border-[#EEF0F3] pt-3">
              {lc.stats.map((st, sIdx) => (
                <div key={sIdx}>
                  <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    {st.label}
                  </div>
                  <div
                    className={`mt-0.5 text-[14px] font-extrabold font-mono tabular-nums ${
                      st.value === "—" ? "text-[#94A3B8]" : "text-[#0F172A]"
                    }`}
                  >
                    {st.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
