"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ErrorBanner } from "@/components/shared/error-states";
import { sendCompetitiveWeeklyReportNow, updateCompetitiveSettings } from "@/lib/competitive-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { MAX_COMPETITORS } from "@/lib/competitors";
import { useCompetitiveData } from "../competitive-data";
import { Card, CardHead, Chip, SkeletonBlock } from "../competitive-ui";

const ETHICS = [
  "Only pages anyone can visit are read — public Google listings, the public Meta Ad Library and public Instagram business profiles.",
  "No account is logged into, and nothing behind a login is ever accessed.",
  "No staff details or customer lists are collected about a competitor. The only contact details shown are the ones the business publishes on its own Google listing.",
  "Revenue, spend, margins and customer counts are never estimated or presented as known.",
  "Every change carries its source and the date it was seen.",
  "An observation is never overwritten — a price change is a new entry, so history is kept and you can see what actually changed.",
  "Nothing here changes your prices, products or campaigns. It only tells you what is happening.",
];

const numberInput =
  "min-h-[40px] w-[96px] rounded-[10px] border border-[#E6EAF0] bg-white px-3 text-right text-[12.5px] font-extrabold text-[#101828] focus:border-[#12A150] focus:outline-none focus:ring-[3px] focus:ring-[rgba(18,161,80,.12)]";

export function SettingsScreen() {
  const data = useCompetitiveData();
  if (data.error) return <ErrorBanner title="Couldn't load competitors" onRetry={data.refetch} />;
  if (data.loading || !data.settings) return <SkeletonBlock h={320} />;
  // Keyed on the saved values so the form re-seeds after a save (or a refetch that changed them).
  const s = data.settings;
  const key = `${s.scanFrequencyDays}|${s.keywordRankAlertThreshold}|${s.reviewFreshnessAlertDays}|${s.weeklyReportRecipient ?? ""}`;
  return <SettingsForm key={key} />;
}

function SettingsForm() {
  const qc = useQueryClient();
  const data = useCompetitiveData();
  const s = data.settings!;

  const [scan, setScan] = useState(String(s.scanFrequencyDays));
  const [rank, setRank] = useState(String(s.keywordRankAlertThreshold));
  const [fresh, setFresh] = useState(String(s.reviewFreshnessAlertDays));
  const [email, setEmail] = useState(s.weeklyReportRecipient ?? "");

  const save = useMutation({
    mutationFn: () =>
      updateCompetitiveSettings({
        scanFrequencyDays: Number(scan),
        keywordRankAlertThreshold: Number(rank),
        reviewFreshnessAlertDays: Number(fresh),
        weeklyReportRecipient: email.trim() === "" ? null : email.trim(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["competitive-settings"] });
      toast.success("Monitoring settings saved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save settings."),
  });

  const testReport = useMutation({
    mutationFn: sendCompetitiveWeeklyReportNow,
    onSuccess: (r) => {
      if (r.sent) toast.success(`Report sent to ${r.recipient}.`);
      else toast.error(r.message);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send the report."),
  });

  const validInt = (v: string) => /^\d+$/.test(v) && Number(v) >= 1;
  const valid = validInt(scan) && validInt(rank) && validInt(fresh) && (email.trim() === "" || /^\S+@\S+\.\S+$/.test(email.trim()));
  const dirty =
    Number(scan) !== s.scanFrequencyDays ||
    Number(rank) !== s.keywordRankAlertThreshold ||
    Number(fresh) !== s.reviewFreshnessAlertDays ||
    (email.trim() || null) !== s.weeklyReportRecipient;

  const linked = data.competitors.filter((c) => !!c.metaPageId).length;
  const igSet = data.competitors.filter((c) => !!c.instagramHandle).length;
  const igReadable = data.competitors.filter((c) => data.social[c.id]?.status === "ok").length;
  const watchlist = [
    { l: "How often Google ratings are checked", v: `Every ${s.scanFrequencyDays} day${s.scanFrequencyDays === 1 ? "" : "s"}`, note: "Public rating and review count for each competitor — set below" },
    { l: "Competitors watched", v: `${data.competitors.length} of ${MAX_COMPETITORS} allowed`, note: "Each one is added by you, never automatically" },
    { l: "History kept", v: "Nothing is overwritten", note: "Every snapshot and observation keeps its date and source" },
  ];
  const checks: { l: string; status: string; tone: string }[] = [
    { l: "Public Google rating and review count", status: "Active", tone: "Ahead" },
    { l: "Website, address, phone, category and hours", status: "Read on demand", tone: "Observed" },
    { l: "Recent public reviews", status: "Read on demand", tone: "Observed" },
    { l: "Ads in the Meta Ad Library", status: linked ? `${linked} of ${data.competitors.length} linked` : "Needs a linked page", tone: linked ? "Ahead" : "Level" },
    { l: "Prices, services and offers", status: "Recorded by you", tone: "Observed" },
    {
      l: "Instagram posting",
      status: igSet ? `${igReadable} of ${data.competitors.length} readable` : "Needs a username",
      tone: igReadable ? "Ahead" : "Level",
    },
    { l: "Price lists on their websites, Facebook and TikTok posts", status: "Not collected", tone: "Level" },
  ];

  return (
    <div className="flex flex-col gap-[15px]">
      <Card overflow>
        <CardHead title="Watchlist" />
        <div>
          {watchlist.map((w) => (
            <div key={w.l} className="flex flex-wrap items-center gap-3 border-t border-[#F2F4F7] px-[17px] py-[13px]">
              <span className="min-w-[200px] flex-1">
                <span className="block text-[12.5px] font-bold text-[#344054]">{w.l}</span>
                <span className="mt-0.5 block text-[11px] text-[#98A2B3]">{w.note}</span>
              </span>
              <span className="text-[12.5px] font-extrabold text-[#101828]">{w.v}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-[15px] min-[1100px]:grid-cols-2">
        <Card overflow>
          <CardHead title="What gets checked" />
          <div>
            {checks.map((m) => (
              <div key={m.l} className="flex items-center gap-3 border-t border-[#F2F4F7] px-[17px] py-3">
                <span className="flex-1 text-[12.5px] text-[#344054]">{m.l}</span>
                <Chip tone={m.tone} className="px-[9px] py-[3px] text-[10px]">
                  {m.status}
                </Chip>
              </div>
            ))}
          </div>
        </Card>
        <Card overflow>
          <CardHead title="When to tell you" />
          <div>
            <label className="flex items-center gap-3 border-t border-[#F2F4F7] px-[17px] py-3">
              <span className="flex-1 text-[12.5px] text-[#344054]">Check competitor ratings every (days)</span>
              <input inputMode="numeric" aria-label="Scan frequency in days" value={scan} onChange={(e) => setScan(e.target.value.replace(/\D/g, ""))} className={numberInput} />
            </label>
            <label className="flex items-center gap-3 border-t border-[#F2F4F7] px-[17px] py-3">
              <span className="flex-1 text-[12.5px] text-[#344054]">Flag a keyword that ranks worse than #</span>
              <input inputMode="numeric" aria-label="Keyword rank alert threshold" value={rank} onChange={(e) => setRank(e.target.value.replace(/\D/g, ""))} className={numberInput} />
            </label>
            <label className="flex items-center gap-3 border-t border-[#F2F4F7] px-[17px] py-3">
              <span className="flex-1 text-[12.5px] text-[#344054]">Flag when you have no new review in (days)</span>
              <input inputMode="numeric" aria-label="Review freshness in days" value={fresh} onChange={(e) => setFresh(e.target.value.replace(/\D/g, ""))} className={numberInput} />
            </label>
            <label className="flex flex-wrap items-center gap-3 border-t border-[#F2F4F7] px-[17px] py-3">
              <span className="min-w-[160px] flex-1 text-[12.5px] text-[#344054]">Email the weekly report to</span>
              <input
                type="email"
                aria-label="Weekly report recipient"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Not sent"
                className="min-h-[40px] w-[230px] rounded-[10px] border border-[#E6EAF0] bg-white px-3 text-[12.5px] text-[#101828] focus:border-[#12A150] focus:outline-none focus:ring-[3px] focus:ring-[rgba(18,161,80,.12)]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 border-t border-[#F2F4F7] px-[17px] py-3 text-[11px] leading-[1.55] text-[#98A2B3]">
              <span className="min-w-[200px] flex-1">
                The report goes out on Mondays at 07:00 with rating movement, what you recorded and open gaps. The keyword and review thresholds apply each time gaps are
                checked — weekly, or when you press “Check for gaps now”. There are no push alerts.
              </span>
              <button
                type="button"
                onClick={() => testReport.mutate()}
                disabled={testReport.isPending || !s.weeklyReportRecipient || dirty}
                title={!s.weeklyReportRecipient ? "Save a recipient first" : dirty ? "Save your changes first" : undefined}
                className="min-h-[40px] cursor-pointer rounded-[10px] border border-[#E6EAF0] bg-white px-3 text-[11.5px] font-bold text-[#0E8442] hover:border-[#12A150] hover:bg-[#F7FCF9] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {testReport.isPending ? "Sending…" : "Send a report now"}
              </button>
            </div>
          </div>
        </Card>
      </div>

      <Card border="#BFE7CF" thick pad>
        <h3 className="m-0 mb-1 text-[14.5px] font-extrabold text-[#101828]">Where the line is</h3>
        <p className="m-0 mb-[13px] text-[12px] text-[#667085]">These are fixed and cannot be switched off.</p>
        <div className="flex flex-col gap-[9px]">
          {ETHICS.map((e) => (
            <div key={e} className="flex items-start gap-2.5">
              <svg className="mt-0.5 flex-none" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0E8442" strokeWidth="2.4" strokeLinecap="round">
                <path d="m5 13 4 4L19 7" />
              </svg>
              <span className="text-[12.5px] leading-[1.6] text-[#344054]">{e}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!valid || !dirty || save.isPending}
          className="min-h-[46px] cursor-pointer rounded-[12px] border-0 bg-[#12A150] px-[22px] py-3 text-[13px] font-extrabold text-white transition-colors hover:bg-[#0E8442] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {save.isPending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}
