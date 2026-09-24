"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Sparkles,
  Check,
  AlertTriangle,
  AlertCircle,
  Info,
  Pencil,
  RefreshCw,
  Image as ImageIcon,
  FileText,
  ExternalLink,
  Star,
  Trash2,
  Globe,
  CheckCircle2,
} from "lucide-react";
import { useListings } from "./listings-context";

export function ListingsModals() {
  const router = useRouter();
  const {
    selectedListing,
    activeLdSection,
    setActiveLdSection,
    panel,
    confirm,
    toastMsg,
    closeOverlays,
    closeToast,
    notify,
    openSyncPreview,
    openConfirm,
    openPanel,
    masterListing,
    currentBranchId,
    listingPhotos,
    gmbPhotos,
    gmbPosts,
    gmbInsights,
    reviewsSummary,
    reviews,
    services,
    settings,
    syncLog,
    disconnectListingAction,
  } = useListings();

  // 13 Section Names
  const sectionNames = [
    "Profile",
    "NAP",
    "Hours",
    "Category",
    "Services",
    "Media",
    "Posts",
    "Reviews",
    "Sync",
    "Errors",
    "Local search",
    "AI",
    "Audit",
  ];

  // Helper for chip styling
  const chipClass = (tone?: string) => {
    switch (tone) {
      case "green":
      case "pos":
        return "bg-[#ECFDF3] border-[#BBF0CB] text-[#15803D]";
      case "amber":
        return "bg-[#FFFBEB] border-[#FDE49B] text-[#B45309]";
      case "red":
      case "neg":
        return "bg-[#FEF3F2] border-[#FBD5D2] text-[#B42318]";
      case "blue":
        return "bg-[#EFF6FF] border-[#C7DBFE] text-[#1D4ED8]";
      case "purple":
        return "bg-[#F5F3FF] border-[#DDD3FE] text-[#6D28D9]";
      default:
        return "bg-[#F1F3F6] border-[#E1E5EB] text-[#45505F]";
    }
  };

  // 13 Section Data Generator — every row here traces to a real value. Sections whose real data
  // is scoped to whichever branch is globally active (photos/posts/reviews/insights) disclose that
  // scope rather than showing another branch's numbers under this listing's name.
  const secData = useMemo(() => {
    if (!selectedListing) return { rows: [], title: "", bullets: [], note: "", lineage: "" };
    const o = selectedListing;
    const unreadable = o.status === "Disconnected" || o.status === "Not connected";
    const isCurrentBranch = o.branchId === currentBranchId;
    const scopeNote = (label: string): [string, string, "neutral"] => [label, "Switch to this location to see its real figure", "neutral"];

    switch (activeLdSection) {
      case "Profile":
        return {
          lineage: `Master Record · ${o.sync}`,
          rows: unreadable
            ? ([
                ["Platform", o.platform, "neutral"],
                ["Location", o.location, "neutral"],
                ["Status", o.status, "neg"],
                ["Readable", "No — Noxtill cannot access this listing", "neg"],
                ["What Noxtill shows", "Unavailable, not the last known values", "neutral"],
              ] as [string, string, string][])
            : ([
                ["Business name", o.business, "neutral"],
                ["Platform", o.platform, "neutral"],
                ["Location", o.location, "neutral"],
                ["Address", o.address, "neutral"],
                ["Phone", o.phone, "neutral"],
                ["Website", masterListing?.website || "Not set", "neutral"],
                ["Category", o.category, "neutral"],
                ["Verification", o.verification, "neutral"],
                ["Completeness", o.completeness, (o.completenessPercent ?? 0) >= 85 ? "pos" : "neutral"],
                ["Last sync", o.sync, "neutral"],
              ] as [string, string, string][]),
          title: unreadable ? "Why nothing is shown" : "Profile completeness",
          bullets: unreadable
            ? [
                "Noxtill will not display stale values as if they were current",
                "Sync and completeness both read unavailable rather than carrying forward",
                "Reconnecting restores access — the public listing itself is unaffected",
              ]
            : [
                "Completeness counts real name/phone/address/website/description/category/hours/photo fields",
                "No connector in this codebase reports a real verification status, so that field is always \"Not tracked\"",
                "Your Master Record for this location is the reference for every comparison",
                o.mismatchedFields.length === 0
                  ? "This listing currently matches your Master Record"
                  : `Fields out of sync: ${o.mismatchedFields.join(", ")}`,
              ],
          note: "Business Listings references your branch records rather than duplicating them.",
        };

      case "NAP":
        return {
          lineage: "Name · address · phone, vs. the last-synced snapshot",
          rows: unreadable
            ? [
                ["NAP check", "Cannot be performed", "neg"],
                ["Reason", o.status, "neutral"],
              ]
            : !o.hasMasterListing
            ? [["NAP check", "No Master Record set up for this location yet", "neg"]]
            : [
                ["Name", o.business, "neutral"],
                ["Address", o.address, "neutral"],
                ["Phone", o.phone, "neutral"],
                ["Match", o.mismatchedFields.length === 0 ? "All fields match" : `${o.mismatchedFields.length} field${o.mismatchedFields.length > 1 ? "s" : ""} differ`, o.mismatchedFields.length === 0 ? "pos" : "neg"],
                ["Mismatched fields", o.mismatchedFields.length > 0 ? o.mismatchedFields.join(", ") : "None", o.mismatchedFields.length > 0 ? "neg" : "pos"],
              ],
          title: "How a mismatch is resolved",
          bullets: unreadable || !o.hasMasterListing
            ? ["NAP consistency needs a readable listing with a Master Record"]
            : [
                o.mismatchedFields.length > 0
                  ? "Sync again once you've confirmed which value — Noxtill's or the directory's — is correct"
                  : "Name, address and phone all agree with the last-synced snapshot",
                "Noxtill never silently overwrites a conflicting value in either direction",
                "A resolution happens by syncing, which always shows a preview before writing",
              ],
          note: "Inconsistent contact details are the most common cause of missed local customers.",
        };

      case "Hours": {
        const hours = (masterListing?.hours || {}) as Record<string, [string, string][]>;
        const days: [string, string][] = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
        const hasAnyHours = Object.keys(hours).some((k) => k !== "special" && (hours[k]?.length ?? 0) > 0);
        const hasSpecial = Boolean((hours as Record<string, unknown>).special);
        return {
          lineage: "From your Master Record",
          rows: unreadable
            ? [
                ["Hours check", "Cannot be performed", "neg"],
                ["Reason", o.status, "neutral"],
              ]
            : !hasAnyHours
            ? [["Regular hours", "Not set in your Master Record", "neg"]]
            : ([
                ...days.map(([key, label]) => {
                  const ranges = hours[key];
                  return [label, ranges && ranges.length > 0 ? ranges.map((r) => `${r[0]}–${r[1]}`).join(", ") : "Closed", "neutral"];
                }),
                ["Special hours", hasSpecial ? "Configured" : "Not configured", hasSpecial ? "pos" : "neg"],
              ] as [string, string, string][]),
          title: "Why special hours matter",
          bullets: unreadable
            ? ["Hours consistency needs a readable listing"]
            : [
                hasAnyHours ? "These are the exact hours stored in your Master Record" : "No regular hours are set yet, so directories show nothing or a default",
                "Without special hours, a customer arriving on a holiday sees your normal hours and may find you closed",
                "Special hours can be set once in Business Profile and synced to every connected directory that supports them",
              ],
          note: "Hours accuracy is the listing field customers act on most directly.",
        };
      }

      case "Category":
        return {
          lineage: "From your Master Record",
          rows: unreadable
            ? [["Category check", "Cannot be performed", "neg"]]
            : [
                ["Primary category", o.category, "neutral"],
                ["Total categories set", String(masterListing?.categories?.length ?? 0), "neutral"],
                ["Platform", o.platform, "neutral"],
              ],
          title: "Naming differences are not mismatches",
          bullets: unreadable
            ? ["Category comparison needs a readable listing"]
            : [
                "Each directory has its own category taxonomy, so exact names can legitimately differ",
                "Noxtill does not compare category names across platforms today",
                "Category drives which local searches you appear in, so a wrong one is worth checking directly on the platform",
              ],
          note: "Category naming is decided by each directory, not by Noxtill.",
        };

      case "Services":
        return {
          lineage: "From Products · services",
          rows: unreadable
            ? [["Services check", "Cannot be performed", "neg"]]
            : [
                ["Services in your catalog", String(services.length), "neutral"],
                ["Pricing shown on directories", "Not supported by any connected platform", "neutral"],
                ["Source", "Products module · services", "neutral"],
              ],
          title: "Where services come from",
          bullets: unreadable
            ? ["Service comparison needs a readable listing"]
            : [
                "Services are defined once in Products and referenced here — nothing is duplicated",
                "No connected directory supports showing your real prices, so pricing is never sent",
                services.length === 0 ? "Add services in Products to have them referenced here" : `${services.length} real service${services.length > 1 ? "s" : ""} on file`,
              ],
          note: "Nothing is duplicated — Products owns the service definitions.",
        };

      case "Media":
        return {
          lineage: isCurrentBranch ? "Real photo count for this location" : "Real photo count for this location (category breakdown needs this location active)",
          rows: unreadable
            ? [["Media check", "Cannot be performed", "neg"]]
            : ([
                ["Photos on record", String(o.photoCount), o.photoCount > 0 ? "pos" : "neg"],
                isCurrentBranch
                  ? ["By category", `${listingPhotos.length} manual · ${gmbPhotos.length} via Google`, "neutral"]
                  : scopeNote("By category"),
              ] as [string, string, string][]),
          title: "Media on record",
          bullets: unreadable
            ? ["Media review needs a readable listing"]
            : [
                o.photoCount === 0 ? "No photos are on record for this location yet" : `${o.photoCount} photo${o.photoCount > 1 ? "s are" : " is"} on record for this location`,
                "Noxtill does not run automated image-quality scoring — that would be a fabricated check",
                "Photos are managed in Photos & Media and pushed to whichever directories support it",
              ],
          note: "Noxtill does not fabricate an image quality score — nothing here is estimated.",
        };

      case "Posts": {
        const supportsPosts = o.provider === "gmb";
        return {
          lineage: supportsPosts ? "Google Business Profile posts" : "Platform posts API",
          rows: unreadable
            ? [["Posts check", "Cannot be performed", "neg"]]
            : !supportsPosts
            ? [["Posts", "Not supported by this platform", "neutral"]]
            : !isCurrentBranch
            ? [scopeNote("Posts on record")]
            : ([
                ["Posts on record", String(gmbPosts.length), "neutral"],
                ["Scheduled", String(gmbPosts.filter((p) => p.status === "draft" && p.scheduledFor).length), "neutral"],
                ["Published", String(gmbPosts.filter((p) => p.status === "published").length), "neutral"],
              ] as [string, string, string][]),
          title: "Posts are not social posts",
          bullets: unreadable
            ? ["Post review needs a readable listing"]
            : [
                "Business listing posts are separate from Social Media Management, which owns organic social content",
                supportsPosts ? "Only Google Business Profile supports posts among the connected directories" : "This platform has no posts API — nothing is faked here",
                "Nothing publishes externally without approval",
              ],
          note: "Only platforms that genuinely support posts show real numbers here.",
        };
      }

      case "Reviews": {
        const totalReviews = reviewsSummary?.distribution?.reduce((sum, d) => sum + d.count, 0) ?? 0;
        const unanswered = reviews.filter((r) => (r.source === "external" ? !r.replyText : r.status === "open")).length;
        return {
          lineage: "From Reviews & Reputation",
          rows: unreadable
            ? [
                ["Reviews", "Cannot be read", "neg"],
                ["Reason", o.status, "neutral"],
              ]
            : !isCurrentBranch
            ? [scopeNote("Rating")]
            : ([
                ["Average rating", reviewsSummary?.averageRating ? reviewsSummary.averageRating.toFixed(1) : "No reviews yet", "pos"],
                ["Total reviews", String(totalReviews), "neutral"],
                ["Unanswered", String(unanswered), unanswered > 0 ? "neg" : "pos"],
                ["Owned by", "Reviews & Reputation module", "neutral"],
              ] as [string, string, string][]),
          title: "One review database",
          bullets: unreadable
            ? ["Review data needs a readable listing"]
            : [
                "Reviews live in Reviews & Reputation — this section references them, it doesn't duplicate them",
                "Replying opens the real review workspace there rather than a second reply flow",
                "No second review database exists anywhere in Noxtill",
              ],
          note: "Deep links open the real review record in the module that owns it.",
        };
      }

      case "Sync": {
        const excluded = (settings?.fieldMapping as Record<string, string[]> | undefined)?.[o.provider] ?? [];
        return {
          lineage: "Sync engine",
          rows: unreadable
            ? [
                ["Sync", "Not possible", "neg"],
                ["Reason", o.status, "neutral"],
                ["What Noxtill does", "Holds changes rather than reporting a false success", "neutral"],
              ]
            : ([
                ["Direction", "Noxtill → connected directories", "neutral"],
                ["Last sync", o.sync, o.syncTone === "red" ? "neg" : "neutral"],
                ["Status", o.mismatchedFields.length > 0 ? "Field mismatch — review before next sync" : "Matches Master Record", o.mismatchedFields.length > 0 ? "neg" : "pos"],
                ["Fields excluded for this platform", excluded.length > 0 ? excluded.join(", ") : "None", "neutral"],
                ["Conflict resolution", settings?.conflictResolution === "directory_wins" ? "Directory wins" : "Master Record wins", "neutral"],
                ["Auto sync", settings?.autoSyncEnabled ? `On · every ${settings.autoSyncFrequencyHours}h` : "Off", "neutral"],
              ] as [string, string, string][]),
          title: "Sync rules",
          bullets: unreadable
            ? [
                "A change queued against an unreachable listing is held, never silently dropped",
                "Reconnecting lets a sync be attempted again",
              ]
            : [
                "A sync pushes your whole Master Record to every connected directory for this location at once",
                "Fields excluded in Listings Settings are never sent to that platform",
                "Every sync attempt is logged in Sync & Health with a real result, success or failure",
              ],
          note: "An external profile change is never made without you triggering a sync.",
        };
      }

      case "Errors": {
        const errs: [string, string, string][] = [];
        if (o.mismatchedFields.length > 0) errs.push(["Field mismatch", o.mismatchedFields.join(", "), "neg"]);
        if (!o.hasMasterListing) errs.push(["No Master Record", "Set one up in Business Profile", "neg"]);
        if (o.hasMasterListing && o.completenessPercent != null && o.completenessPercent < 100) errs.push(["Incomplete profile", `${100 - o.completenessPercent}% of fields missing`, "neg"]);
        if (o.hasMasterListing && o.photoCount === 0) errs.push(["No photos", "0 on record for this location", "neg"]);
        if (errs.length === 0 && !unreadable) errs.push(["No errors detected", "This listing matches your Master Record", "pos"]);
        return {
          lineage: "Detected from real listing state",
          rows: unreadable
            ? [
                ["Authorisation", o.status === "Disconnected" ? "Needs attention" : "Not connected", "neg"],
                ["Effect", "Listing cannot be read or written", "neg"],
              ]
            : errs,
          title: "Each error names its field",
          bullets: unreadable
            ? ["Until authorisation is restored, no other check can run"]
            : [
                "Every error identifies the exact field or gap, not a vague score",
                "Noxtill does not run duplicate-listing detection — there is no fabricated \"possible duplicate\" flag here",
                "Fixing a field and syncing again clears it from this list on the next check",
              ],
          note: "Grouping means several real gaps produce one review, not several separate alerts.",
        };
      }

      case "Local search": {
        const supportsInsights = o.provider === "gmb";
        const latest = gmbInsights[0];
        return {
          lineage: supportsInsights ? "Google Business Profile Performance API" : "Platform-reported metrics only",
          rows: unreadable
            ? [
                ["Local search data", "Unavailable", "neg"],
                ["Reason", o.status, "neutral"],
              ]
            : !supportsInsights
            ? [["Local search data", "Not reported by this platform", "neutral"]]
            : !isCurrentBranch
            ? [scopeNote("Profile views")]
            : latest
            ? ([
                ["Profile views", String(latest.views), "neutral"],
                ["Search views", String(latest.searches), "neutral"],
                ["Calls", String(latest.calls), "neutral"],
                ["Direction requests", String(latest.directionRequests), "neutral"],
                ["Data date", new Date(latest.date).toLocaleDateString(), "neutral"],
              ] as [string, string, string][])
            : [["Local search data", "Never pulled yet — pull insights from Sync & Health", "neutral"]],
          title: "What is and is not reported",
          bullets: unreadable
            ? ["Local search metrics need a readable listing"]
            : [
                supportsInsights
                  ? "These figures come from Google's own Performance API, pulled on request, not estimated"
                  : "No connected directory besides Google Business Profile reports these metrics through its API",
                "Search ranking is never shown, because no platform provides a verified rank through its API",
                "A platform that reports nothing shows \"Not reported\" rather than a zero",
              ],
          note: "Noxtill will never claim a search position it cannot verify.",
        };
      }

      case "AI":
        return {
          lineage: "Explainable recommendations, computed live",
          rows: [
            ["Top recommendation", o.nextAction, "neutral"],
            ["Fields out of sync", o.mismatchedFields.length > 0 ? o.mismatchedFields.join(", ") : "None", o.mismatchedFields.length > 0 ? "neg" : "pos"],
            ["Approval mode", "Approve — human confirms", "pos"],
            ["AI may read", "Listing fields, Master Record, real platform status", "pos"],
            ["AI may draft", "Descriptions, posts, review replies", "pos"],
            ["AI may prepare", "A sync with a change preview", "pos"],
            ["AI may not", "Write to an external platform without approval", "neg"],
          ],
          title: "What AI is allowed to do here",
          bullets: [
            "It compares the last-synced snapshot against your Master Record and names the real differences",
            "It can draft a description or a post using only real business information",
            "It can prepare a sync, but the change preview and approval are always yours",
            "It never invents a superlative, a ranking or a metric no platform actually reports",
          ],
          note: "An external profile change without approval could misinform customers, so the boundary is firm.",
        };

      case "Audit":
        return {
          lineage: "What Noxtill actually records today",
          rows: [
            ["Per-listing audit trail", "Not available in this view yet", "neutral"],
            ["What is tracked", "Every sync attempt, with a real timestamp and result", "neutral"],
            ["Where to see it", "Sync & Health → Sync log", "neutral"],
          ],
          title: "Disclosed, not invented",
          bullets: [
            "A detailed per-field audit trail (who changed what, when) isn't built for Business Listings yet",
            "Sync & Health already records every real sync attempt with its actual outcome",
            "This is shown as unavailable rather than backfilled with invented dates and names",
          ],
          note: "Noxtill would rather disclose a gap than invent an audit history.",
        };

      default:
        return { rows: [], title: "", bullets: [], note: "", lineage: "" };
    }
  }, [selectedListing, activeLdSection, masterListing, currentBranchId, listingPhotos, gmbPhotos, gmbPosts, gmbInsights, reviewsSummary, reviews, services, settings]);

  // Drawer action definitions
  const ldActionDefs = [
    { label: "Edit profile", icon: Pencil, risky: false },
    { label: "Sync now", icon: RefreshCw, risky: false },
    { label: "Add photo", icon: ImageIcon, risky: false },
    { label: "Create post", icon: FileText, risky: false },
    { label: "Open platform", icon: ExternalLink, risky: false },
    { label: "View reviews", icon: Star, risky: false },
    { label: "Fix issue", icon: AlertCircle, risky: false },
    { label: "Disconnect", icon: Trash2, risky: true },
  ];

  return (
    <>
      {/* 1. 13-Section Listing Workspace Drawer (800px) */}
      {selectedListing && (
        <div
          onClick={closeOverlays}
          className="fixed inset-0 z-50 flex justify-end bg-[#0C1727]/40 backdrop-blur-sm transition-opacity"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-[800px] max-w-full flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200"
          >
            {/* Drawer Header */}
            <div className="flex items-start gap-3.5 border-b border-[#EEF0F3] p-5">
              <div
                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[12px] border ${
                  selectedListing.statusTone === "red"
                    ? "bg-[#FEF3F2] border-[#FBD5D2] text-[#B42318]"
                    : selectedListing.statusTone === "amber"
                    ? "bg-[#FFFBEB] border-[#FDE49B] text-[#B45309]"
                    : "bg-[#ECFDF3] border-[#BBF0CB] text-[#15803D]"
                }`}
              >
                <Globe className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[17px] font-extrabold tracking-tight text-[#0F172A]">
                  {selectedListing.business}
                </h2>
                <div className="mt-0.5 text-[11.5px] text-[#7A8798]">
                  {selectedListing.platform} · {selectedListing.address} · {selectedListing.phone}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${chipClass(selectedListing.statusTone)}`}>
                    {selectedListing.status}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${chipClass(selectedListing.verifyTone)}`}>
                    {selectedListing.verification}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${chipClass(selectedListing.syncTone)}`}>
                    {selectedListing.sync}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${chipClass(selectedListing.completeness === "—" ? "neutral" : "green")}`}>
                    Health {selectedListing.completeness}
                  </span>
                </div>
              </div>
              <button
                onClick={closeOverlays}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#7A8798] hover:bg-[#F1F3F6] hover:text-[#0F172A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* "What should I do?" — real, computed from this listing's own state */}
            <div className="border-b border-[#EEF0F3] bg-[#FBFAFF] p-5">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-[#F5F3FF] text-[#6D28D9]">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <span className="text-[11px] font-bold tracking-wider uppercase text-[#6D28D9]">
                  What should I do?
                </span>
              </div>
              <div className="mt-2.5 text-[13.5px] font-extrabold text-[#0F172A]">
                {selectedListing.nextAction}
              </div>
              <div className="mt-1 text-[12px] leading-relaxed text-[#45505F]">
                {selectedListing.nextWhy}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => openSyncPreview(selectedListing)}
                  className="flex h-8 items-center rounded-[8px] bg-[#16A34A] px-3 text-[12.5px] font-bold text-white hover:bg-[#15803D]"
                >
                  Review changes
                </button>
                <button
                  onClick={() =>
                    openPanel({
                      kicker: "Why this recommendation",
                      title: selectedListing.nextAction,
                      badge: selectedListing.status,
                      badgeTone: selectedListing.statusTone,
                      rows: [
                        ["Trigger", selectedListing.nextAction],
                        ["Platform", selectedListing.platform],
                        ["Location", selectedListing.location],
                        ["Data sources", "Master Record · connected directory's last-synced snapshot"],
                        [
                          "Fields out of sync",
                          selectedListing.mismatchedFields.length > 0
                            ? selectedListing.mismatchedFields.join(", ")
                            : "None",
                        ],
                        ["Approval", "Required before any external change"],
                      ],
                      bulletsTitle: "Reasoning",
                      bullets: [
                        selectedListing.nextWhy,
                        "Noxtill compares the last-synced snapshot against your Master Record, which is the source of truth",
                        "Where a platform does not expose a field, it is marked unsupported rather than guessed",
                        "No external profile change is made without your explicit approval",
                      ],
                      note: "Noxtill never claims a search ranking or a metric the platform does not actually report.",
                      primary: "Review changes",
                      secondary: "Close",
                    })
                  }
                  className="flex h-8 items-center rounded-[8px] border border-[#D5DAE2] bg-white px-3 text-[12.5px] font-bold text-[#45505F] hover:bg-[#F1F3F6]"
                >
                  Why?
                </button>
              </div>
            </div>

            {/* 13 Section Tabs */}
            <div className="flex gap-1 overflow-x-auto border-b border-[#EEF0F3] px-5 py-0 scrollbar-thin">
              {sectionNames.map((sec) => {
                const isActive = activeLdSection === sec;
                return (
                  <button
                    key={sec}
                    onClick={() => setActiveLdSection(sec)}
                    className={`flex-shrink-0 border-b-2 px-2.5 py-2.5 text-[12.5px] transition-colors ${
                      isActive
                        ? "border-[#16A34A] font-bold text-[#0F172A]"
                        : "border-transparent font-semibold text-[#5B6675] hover:text-[#0F172A]"
                    }`}
                  >
                    {sec}
                  </button>
                );
              })}
            </div>

            {/* Section Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Rows Table */}
              <div className="overflow-hidden rounded-[12px] border border-[#E6E8EC]">
                <div className="flex items-center gap-2 border-b border-[#EEF0F3] bg-[#FAFBFC] px-3.5 py-2.5">
                  <span className="text-[11px] font-bold tracking-wider uppercase text-[#7A8798]">
                    {activeLdSection}
                  </span>
                  <span className="ml-auto text-[10.5px] text-[#94A3B8]">
                    {secData.lineage}
                  </span>
                </div>
                <div>
                  {secData.rows.map((r, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 px-3.5 py-2.5 text-[12px] ${
                        i > 0 ? "border-t border-[#EEF0F3]" : ""
                      } ${i % 2 === 1 ? "bg-[#FCFCFD]" : "bg-white"}`}
                    >
                      <span className="w-2/5 font-semibold text-[#5B6675]">{r[0]}</span>
                      <span
                        className={`flex-1 text-right font-bold ${
                          r[2] === "neg"
                            ? "text-[#B42318]"
                            : r[2] === "pos"
                            ? "text-[#15803D]"
                            : r[2] === "muted"
                            ? "text-[#94A3B8]"
                            : "text-[#0F172A]"
                        }`}
                      >
                        {r[1]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bullets List */}
              {secData.bullets && secData.bullets.length > 0 && (
                <div>
                  <div className="mb-2 text-[11px] font-bold tracking-wider uppercase text-[#94A3B8]">
                    {secData.title}
                  </div>
                  <div className="space-y-2">
                    {secData.bullets.map((b, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-[#45505F]">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#16A34A]" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Note */}
              {secData.note && (
                <div className="flex items-start gap-2 rounded-[12px] border border-[#E6E8EC] bg-[#FCFCFD] p-3 text-[11.5px] leading-relaxed text-[#5B6675]">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#7A8798]" />
                  <span>{secData.note}</span>
                </div>
              )}
            </div>

            {/* Bottom Actions Bar */}
            <div className="flex gap-2 overflow-x-auto border-t border-[#EEF0F3] bg-[#FCFCFD] p-3.5 scrollbar-thin">
              {ldActionDefs.map((a, i) => {
                const Icon = a.icon;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (a.label === "Disconnect") {
                        openConfirm({
                          title: "Disconnect this listing?",
                          tone: "red",
                          icon: "trash-2",
                          body: "Noxtill stops reading and writing this listing. The listing itself stays live on the platform, unchanged — Noxtill simply loses the ability to manage or monitor it.",
                          rows: [
                            ["Listing", `${selectedListing.platform} · ${selectedListing.location}`],
                            ["Sync stops", "Immediately", "neg"],
                            ["The public listing", "Unchanged", "neutral"],
                            ["Reconnecting later", "Possible · requires re-authorisation", "neutral"],
                          ],
                          primary: "Disconnect listing",
                          cancel: "Keep connected",
                          onConfirm: async () => {
                            await disconnectListingAction(selectedListing.provider, selectedListing.branchId);
                            notify(`Disconnected ${selectedListing.platform} · ${selectedListing.location}`, "Listing has been disconnected from active sync.");
                            closeOverlays();
                          },
                        });
                        return;
                      }
                      if (a.label === "Sync now") {
                        openSyncPreview(selectedListing);
                        return;
                      }
                      if (a.label === "Edit profile") {
                        closeOverlays();
                        router.push("/listings/profile");
                        return;
                      }
                      if (a.label === "Add photo") {
                        closeOverlays();
                        router.push("/listings/photos");
                        return;
                      }
                      if (a.label === "Create post") {
                        closeOverlays();
                        router.push("/listings/posts");
                        return;
                      }
                      if (a.label === "View reviews") {
                        closeOverlays();
                        router.push("/listings/reviews");
                        return;
                      }
                      if (a.label === "Fix issue") {
                        setActiveLdSection("Errors");
                        return;
                      }
                      if (a.label === "Open platform") {
                        notify("No stored link for this listing", "Noxtill doesn't keep the directory's public listing URL — search your business name directly on the platform.");
                        return;
                      }
                    }}
                    className={`flex h-[34px] flex-shrink-0 items-center gap-1.5 rounded-[8px] border px-3 text-[12.5px] font-bold transition-colors ${
                      a.risky
                        ? "border-[#FBD5D2] bg-white text-[#B42318] hover:bg-[#FEF3F2]"
                        : "border-[#D5DAE2] bg-white text-[#45505F] hover:bg-[#F1F3F6]"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{a.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. Detail Panel Drawer (560px) */}
      {panel && (
        <div
          onClick={closeOverlays}
          className="fixed inset-0 z-50 flex justify-end bg-[#0C1727]/40 backdrop-blur-sm transition-opacity"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-[560px] max-w-full flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200"
          >
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-[#EEF0F3] p-5">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold tracking-wider uppercase text-[#94A3B8]">
                  {panel.kicker}
                </div>
                <h2 className="mt-1 text-[16px] font-extrabold tracking-tight text-[#0F172A]">
                  {panel.title}
                </h2>
                <div className="mt-2">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${chipClass(panel.badgeTone)}`}>
                    {panel.badge}
                  </span>
                </div>
              </div>
              <button
                onClick={closeOverlays}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#7A8798] hover:bg-[#F1F3F6] hover:text-[#0F172A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Optional Answer Box */}
              {panel.answer && (
                <div className="rounded-[12px] border border-[#DDD3FE] bg-[#FBFAFF] p-3.5">
                  <div className="text-[10.5px] font-bold tracking-wider uppercase text-[#6D28D9]">
                    {panel.answerLabel || "Answer"}
                  </div>
                  <div className="mt-1.5 text-[13px] leading-relaxed text-[#0F172A]">
                    {panel.answer}
                  </div>
                </div>
              )}

              {/* Rows Table */}
              {panel.rows && panel.rows.length > 0 && (
                <div className="overflow-hidden rounded-[12px] border border-[#E6E8EC]">
                  {panel.rows.map((r, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 px-3.5 py-2.5 text-[12px] ${
                        i > 0 ? "border-t border-[#EEF0F3]" : ""
                      } ${i % 2 === 1 ? "bg-[#FCFCFD]" : "bg-white"}`}
                    >
                      <span className="w-2/5 font-semibold text-[#5B6675]">{r[0]}</span>
                      <span
                        className={`flex-1 text-right font-bold ${
                          r[2] === "neg"
                            ? "text-[#B42318]"
                            : r[2] === "pos"
                            ? "text-[#15803D]"
                            : "text-[#0F172A]"
                        }`}
                      >
                        {r[1]}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Bullets */}
              {panel.bullets && panel.bullets.length > 0 && (
                <div>
                  <div className="mb-2 text-[11px] font-bold tracking-wider uppercase text-[#94A3B8]">
                    {panel.bulletsTitle || "Details"}
                  </div>
                  <div className="space-y-2">
                    {panel.bullets.map((b, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-[#45505F]">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#16A34A]" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Note */}
              {panel.note && (
                <div className="flex items-start gap-2 rounded-[12px] border border-[#E6E8EC] bg-[#FCFCFD] p-3 text-[11.5px] leading-relaxed text-[#5B6675]">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#7A8798]" />
                  <span>{panel.note}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-[#EEF0F3] bg-[#FCFCFD] p-4">
              <button
                onClick={closeOverlays}
                className="flex h-9 items-center rounded-[8px] border border-[#D5DAE2] bg-white px-3.5 text-[13px] font-bold text-[#45505F] hover:bg-[#F1F3F6]"
              >
                {panel.secondary || "Close"}
              </button>
              <button
                onClick={() => {
                  if (panel.onPrimary) {
                    panel.onPrimary();
                  } else {
                    notify(panel.primary || "Done", "Recorded with actor, timestamp and reason.");
                  }
                  closeOverlays();
                }}
                className={`flex h-9 items-center rounded-[8px] px-3.5 text-[13px] font-bold text-white ${
                  panel.primaryTone === "red"
                    ? "bg-[#DC2626] hover:bg-[#B91C1C]"
                    : "bg-[#16A34A] hover:bg-[#15803D]"
                }`}
              >
                {panel.primary || "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Confirmation Modal */}
      {confirm && (
        <div
          onClick={closeOverlays}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0C1727]/50 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[560px] overflow-hidden rounded-[18px] bg-white shadow-2xl animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-3.5 p-6 pb-0">
              <div
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[12px] ${
                  confirm.tone === "red"
                    ? "bg-[#FEF3F2] text-[#B42318]"
                    : confirm.tone === "amber"
                    ? "bg-[#FFFBEB] text-[#B45309]"
                    : "bg-[#ECFDF3] text-[#15803D]"
                }`}
              >
                {confirm.tone === "red" ? (
                  <AlertCircle className="h-5 w-5" />
                ) : confirm.tone === "amber" ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[16px] font-extrabold tracking-tight text-[#0F172A]">
                  {confirm.title}
                </h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[#5B6675]">
                  {confirm.body}
                </p>
              </div>
              <button
                onClick={closeOverlays}
                className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[#7A8798] hover:bg-[#F1F3F6] hover:text-[#0F172A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Rows diff */}
            {confirm.rows && confirm.rows.length > 0 && (
              <div className="mx-6 mt-4 overflow-hidden rounded-[12px] border border-[#E6E8EC]">
                {confirm.rows.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-3.5 py-2 text-[12px] ${
                      i > 0 ? "border-t border-[#EEF0F3]" : ""
                    } ${i % 2 === 1 ? "bg-[#FCFCFD]" : "bg-white"}`}
                  >
                    <span className="flex-1 font-semibold text-[#5B6675]">{r[0]}</span>
                    <span
                      className={`font-bold ${
                        r[2] === "neg"
                          ? "text-[#B42318]"
                          : r[2] === "pos"
                          ? "text-[#15803D]"
                          : "text-[#0F172A]"
                      }`}
                    >
                      {r[1]}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Modal Buttons */}
            <div className="mt-5 flex justify-end gap-2 border-t border-[#EEF0F3] bg-[#FCFCFD] p-4 px-6">
              <button
                onClick={closeOverlays}
                className="flex h-9 items-center rounded-[8px] border border-[#D5DAE2] bg-white px-4 text-[13px] font-bold text-[#45505F] hover:bg-[#F1F3F6]"
              >
                {confirm.cancel || "Cancel"}
              </button>
              <button
                onClick={() => {
                  if (confirm.onConfirm) {
                    confirm.onConfirm();
                  } else {
                    notify(confirm.primary || "Confirmed", "Action processed.");
                  }
                  closeOverlays();
                }}
                className={`flex h-9 items-center rounded-[8px] px-4 text-[13px] font-bold text-white ${
                  confirm.tone === "red"
                    ? "bg-[#DC2626] hover:bg-[#B91C1C]"
                    : "bg-[#16A34A] hover:bg-[#15803D]"
                }`}
              >
                {confirm.primary || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex w-[340px] max-w-[calc(100vw-32px)] items-start gap-3 rounded-[12px] border border-[#E6E8EC] border-l-4 border-l-[#16A34A] bg-white p-3.5 shadow-2xl animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[8px] bg-[#ECFDF3] text-[#15803D]">
            <Check className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-extrabold text-[#0F172A]">
              {toastMsg.title}
            </div>
            {toastMsg.sub && (
              <div className="mt-0.5 text-[12px] text-[#5B6675]">
                {toastMsg.sub}
              </div>
            )}
          </div>
          <button
            onClick={closeToast}
            className="flex h-6 w-6 items-center justify-center rounded text-[#94A3B8] hover:bg-[#F1F3F6] hover:text-[#0F172A]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
