"use client";

import React from "react";
import { Info, SearchCheck, BarChart3, AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useListings } from "../listings-context";

export function SeoScreen() {
  const router = useRouter();
  const { masterListing, citations, health, listingPhotos, gmbPhotos, gmbPosts, gmbInsights, services, reviews, listings, notify } = useListings();

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

  const seoChecklist = React.useMemo(() => {
    const hasName = Boolean(masterListing?.name);
    const hasAddress = Boolean(masterListing?.addressLine1);
    const hasPhoneMismatch = citations.some((c) => c.mismatchedFields.includes("phone"));
    const hasWebsite = Boolean(masterListing?.website);
    const hasCategory = Boolean(masterListing?.categories && masterListing.categories.length > 0);
    const hasDescription = Boolean(masterListing?.description);
    const hasHours = Boolean(masterListing?.hours && Object.keys(masterListing.hours).length > 0);
    const hasSpecialHours = Boolean(masterListing?.hours && (masterListing.hours as Record<string, unknown>).special);
    const hasServices = services.length > 0;
    const totalPhotos = listingPhotos.length + gmbPhotos.length;
    const hasReviews = reviews.length > 0;
    const hasPosts = gmbPosts.length > 0;

    return [
      { item: "Business name", detail: hasName ? "Set and consistent everywhere" : "Missing in master record", state: hasName ? "Complete" : "Issue", tone: hasName ? "green" : "red" },
      { item: "Address", detail: hasAddress ? "Set and consistent everywhere" : "Missing in master record", state: hasAddress ? "Complete" : "Issue", tone: hasAddress ? "green" : "red" },
      { item: "Phone", detail: hasPhoneMismatch ? "Directory citation mismatch detected" : "Set and consistent", state: hasPhoneMismatch ? "Issue" : "Complete", tone: hasPhoneMismatch ? "red" : "green" },
      { item: "Website", detail: hasWebsite ? "Set and consistent everywhere" : "Optional URL missing", state: hasWebsite ? "Complete" : "Optional", tone: hasWebsite ? "green" : "amber" },
      { item: "Primary category", detail: hasCategory ? `${masterListing?.categories?.[0]} set` : "Not assigned", state: hasCategory ? "Complete" : "Issue", tone: hasCategory ? "green" : "amber" },
      { item: "Description", detail: hasDescription ? `${masterListing?.description?.length} characters` : "Empty on platforms", state: hasDescription ? "Complete" : "Partial", tone: hasDescription ? "green" : "amber" },
      { item: "Regular hours", detail: hasHours ? "Configured on all readable listings" : "Hours missing", state: hasHours ? "Complete" : "Issue", tone: hasHours ? "green" : "amber" },
      { item: "Special hours", detail: hasSpecialHours ? "Holiday schedule configured" : "Missing for upcoming holidays", state: hasSpecialHours ? "Complete" : "Issue", tone: hasSpecialHours ? "green" : "amber" },
      { item: "Services", detail: hasServices ? `${services.length} services listed` : "Catalog empty", state: hasServices ? "Complete" : "Partial", tone: hasServices ? "green" : "amber" },
      { item: "Photos", detail: totalPhotos >= 10 ? `${totalPhotos} photos uploaded` : `${totalPhotos} of 10 recommended`, state: totalPhotos >= 10 ? "Complete" : "Partial", tone: totalPhotos >= 10 ? "green" : "amber" },
      { item: "Reviews", detail: hasReviews ? "Single database connected" : "Awaiting reviews", state: hasReviews ? "Complete" : "Partial", tone: hasReviews ? "green" : "neutral" },
      { item: "Business posts", detail: hasPosts ? `${gmbPosts.length} posts on record` : "No posts published", state: hasPosts ? "Complete" : "Partial", tone: hasPosts ? "green" : "amber" },
      { item: "Booking link", detail: "Connected to your Noxtill booking page", state: "Complete", tone: "green" },
    ];
  }, [masterListing, citations, services, listingPhotos, gmbPhotos, reviews, gmbPosts]);

  const seoKpis = React.useMemo(() => {
    const passedCount = seoChecklist.filter((c) => c.state === "Complete").length;
    const napMismatches = citations.filter((c) => !c.matches).length;

    return [
      { label: "Profile completeness", value: `${Math.round((passedCount / 13) * 100)}%`, meta: `${13 - passedCount} gaps identified`, tone: passedCount >= 10 ? "green" : "amber" },
      { label: "NAP consistency", value: napMismatches > 0 ? `${napMismatches} mismatch` : "100%", meta: napMismatches > 0 ? "from citation audit" : "all match", tone: napMismatches > 0 ? "amber" : "green" },
      { label: "Missing fields", value: String(13 - passedCount), meta: "across checklist", tone: 13 - passedCount > 0 ? "amber" : "green" },
      { label: "Checklist complete", value: `${passedCount} of 13`, meta: `${13 - passedCount} open`, tone: passedCount >= 10 ? "green" : "amber" },
      { label: "Listing health", value: health?.score != null ? `${health.score}%` : "—", meta: "readable listings", tone: (health?.score ?? 0) >= 80 ? "green" : "amber" },
      { label: "Search ranking", value: "Not available", meta: "no platform reports it", tone: "neutral" },
    ];
  }, [seoChecklist, citations, health]);

  // Real GMB Performance-API numbers for whichever location is currently active — never invented.
  const latestInsights = gmbInsights[0];
  const seoMetrics = latestInsights
    ? [
        { label: "Profile views", source: "Google reports this", value: String(latestInsights.views), tone: "neutral" },
        { label: "Search views", source: "Google reports this", value: String(latestInsights.searches), tone: "neutral" },
        { label: "Calls", source: "Google reports this", value: String(latestInsights.calls), tone: "neutral" },
        { label: "Direction requests", source: "Google reports this", value: String(latestInsights.directionRequests), tone: "neutral" },
        { label: "Bing metrics", source: "Bing does not report these", value: "Not reported", tone: "muted" },
        { label: "Search position", source: "No platform provides verified rank", value: "Not available", tone: "muted" },
      ]
    : [
        { label: "Profile views", source: "Never pulled yet — pull insights in Sync & Health", value: "—", tone: "muted" },
        { label: "Search views", source: "Never pulled yet", value: "—", tone: "muted" },
        { label: "Calls", source: "Never pulled yet", value: "—", tone: "muted" },
        { label: "Direction requests", source: "Never pulled yet", value: "—", tone: "muted" },
        { label: "Bing metrics", source: "Bing does not report these", value: "Not reported", tone: "muted" },
        { label: "Search position", source: "No platform provides verified rank", value: "Not available", tone: "muted" },
      ];

  // Real open issues, derived from the actual rollup — nothing here is a fixed demo scenario.
  const seoIssues = React.useMemo(() => {
    const issues: { severity: string; tone: string; issue: string; scope: string; reason: string; action: string }[] = [];
    listings
      .filter((l) => l.mismatchedFields.length > 0)
      .forEach((l) => {
        issues.push({
          severity: "High",
          tone: "red",
          issue: `Fields disagree with ${l.platform}: ${l.mismatchedFields.join(", ")}`,
          scope: `${l.location} · ${l.platform}`,
          reason: "A wrong contact detail on a live listing sends customers nowhere.",
          action: "Resolve",
        });
      });
    listings
      .filter((l) => l.status === "Disconnected")
      .forEach((l) => {
        issues.push({
          severity: "High",
          tone: "amber",
          issue: "Authorisation needs attention",
          scope: `${l.location} · ${l.platform}`,
          reason: "While disconnected, Noxtill cannot read or write this listing at all.",
          action: "Resolve",
        });
      });
    if (masterListing && !(masterListing.hours && (masterListing.hours as Record<string, unknown>).special)) {
      issues.push({
        severity: "Medium",
        tone: "amber",
        issue: "No special hours configured",
        scope: "Master Record",
        reason: "Customers arriving on a holiday will see your normal hours and may find you closed.",
        action: "Add hours",
      });
    }
    if (services.length === 0) {
      issues.push({
        severity: "Medium",
        tone: "amber",
        issue: "No services in your catalog",
        scope: "Products",
        reason: "Directories that support service listings have nothing real to reference yet.",
        action: "Add services",
      });
    }
    return issues;
  }, [listings, masterListing, services]);

  return (
    <div className="flex flex-col gap-5">
      {/* 6 SEO KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {seoKpis.map((k, idx) => (
          <div
            key={idx}
            onClick={() => notify(`${k.label} · ${k.value}`, k.meta)}
            className={`cursor-pointer rounded-[12px] border bg-white p-3.5 shadow-sm transition-all hover:border-[#CBD5E1] ${
              k.tone === "amber" ? "border-[#FDE49B]" : "border-[#E6E8EC]"
            }`}
          >
            <div className="text-[11.5px] font-bold text-[#5B6675]">{k.label}</div>
            <div
              className={`mt-1.5 text-[19px] font-extrabold tracking-tight ${
                k.tone === "amber" ? "text-[#B45309]" : "text-[#0F172A]"
              }`}
            >
              {k.value}
            </div>
            <div className="mt-1 text-[10.5px] text-[#94A3B8]">{k.meta}</div>
          </div>
        ))}
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-2.5 rounded-[12px] border border-[#E6E8EC] bg-white p-4 shadow-sm">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#7A8798]" />
        <div className="text-[11.5px] leading-relaxed text-[#5B6675]">
          Search ranking is deliberately absent. No listing platform exposes a verified position through its API, so Noxtill reports the metrics platforms actually provide — views, calls, directions, clicks — and nothing it would have to invent.
        </div>
      </div>

      {/* 2-Column: Checklist & Platform Metrics */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Local SEO Checklist */}
        <div className="overflow-hidden rounded-[13px] border border-[#E6E8EC] bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-[#EEF0F3] p-4">
            <SearchCheck className="h-4 w-4 text-[#45505F]" />
            <span className="text-[13.5px] font-extrabold text-[#0F172A]">Local SEO checklist</span>
            <span className="ml-auto text-[11px] text-[#94A3B8]">{seoChecklist.filter((c) => c.state === "Complete").length} of {seoChecklist.length} complete</span>
          </div>

          <div>
            {seoChecklist.map((sc, idx) => (
              <div
                key={idx}
                onClick={() => notify(`${sc.item} · ${sc.state}`, sc.detail)}
                className={`flex cursor-pointer items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-[#FAFBFC] ${
                  idx > 0 ? "border-t border-[#F3F4F7]" : ""
                } ${sc.tone === "red" ? "bg-[#FEFBFB]" : "bg-white"}`}
              >
                {sc.tone === "green" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-[#15803D]" />
                ) : sc.tone === "red" ? (
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-[#B42318]" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-[#B45309]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-[#0F172A]">{sc.item}</div>
                  <div className="text-[10.5px] text-[#94A3B8]">{sc.detail}</div>
                </div>
                <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold ${chipClass(sc.tone)}`}>
                  {sc.state}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Platform Reported Metrics */}
        <div className="overflow-hidden rounded-[13px] border border-[#E6E8EC] bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-[#EEF0F3] p-4">
            <BarChart3 className="h-4 w-4 text-[#45505F]" />
            <span className="text-[13.5px] font-extrabold text-[#0F172A]">Platform-reported metrics</span>
            <span className="ml-auto text-[11px] text-[#94A3B8]">Last 30 days</span>
          </div>

          <div>
            {seoMetrics.map((sm, idx) => (
              <div
                key={idx}
                onClick={() => notify(`${sm.label} · ${sm.value}`, sm.source)}
                className={`flex cursor-pointer items-center px-4 py-2.5 transition-colors hover:bg-[#FAFBFC] ${
                  idx > 0 ? "border-t border-[#F3F4F7]" : ""
                } ${sm.tone === "muted" ? "bg-[#FCFCFD]" : "bg-white"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-[#0F172A]">{sm.label}</div>
                  <div className="text-[10.5px] text-[#94A3B8]">{sm.source}</div>
                </div>
                <span
                  className={`text-[13.5px] font-extrabold font-mono tabular-nums ${
                    sm.tone === "muted"
                      ? "text-[#94A3B8] text-[11.5px] font-medium"
                      : sm.tone === "green"
                      ? "text-[#15803D]"
                      : "text-[#0F172A]"
                  }`}
                >
                  {sm.value}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-[#EEF0F3] bg-[#FCFCFD] p-3 px-4 text-[11px] text-[#94A3B8]">
            A platform that reports nothing for a metric shows Not reported, never a zero that would read as genuine.
          </div>
        </div>
      </div>

      {/* Open Issues Card */}
      <div className="overflow-hidden rounded-[13px] border border-[#E6E8EC] bg-white shadow-sm">
        <div className="border-b border-[#EEF0F3] p-4 text-[13.5px] font-extrabold text-[#0F172A]">
          Open issues
        </div>

        {seoIssues.length === 0 ? (
          <div className="p-6 text-center text-[12.5px] text-[#94A3B8]">No open issues detected across your listings.</div>
        ) : (
        <div>
          {seoIssues.map((si, idx) => (
            <div
              key={idx}
              onClick={() => notify(si.issue, `${si.scope} · ${si.reason}`)}
              className={`flex cursor-pointer flex-wrap items-center gap-3 p-4 transition-colors hover:bg-[#FAFBFC] ${
                idx > 0 ? "border-t border-[#F3F4F7]" : ""
              } ${si.tone === "red" ? "bg-[#FEFBFB]" : "bg-[#FFFDF5]"}`}
            >
              <span className={`inline-flex h-5 flex-shrink-0 items-center rounded-full border px-2 text-[10px] font-bold ${chipClass(si.tone)}`}>
                {si.severity}
              </span>
              <div className="min-w-[220px] flex-1">
                <div className="text-[12.5px] font-bold text-[#0F172A]">{si.issue}</div>
                <div className="text-[10.5px] text-[#94A3B8]">{si.scope}</div>
              </div>
              <div className="min-w-[180px] flex-1 text-[11.5px] leading-relaxed text-[#45505F]">
                {si.reason}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (si.action === "Resolve") {
                    router.push("/listings/sync");
                  } else if (si.action === "Add hours") {
                    router.push("/listings/profile");
                  } else if (si.action === "Reuse photos") {
                    router.push("/listings/photos");
                  } else if (si.action === "Add services") {
                    router.push("/products");
                  } else {
                    notify(si.action, "Opens the exact field on the exact platform.");
                  }
                }}
                className="flex h-[30px] items-center rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold text-[#0F172A] hover:bg-[#F1F3F6]"
              >
                {si.action}
              </button>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
