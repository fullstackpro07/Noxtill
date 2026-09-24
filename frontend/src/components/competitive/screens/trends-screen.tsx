"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ErrorBanner } from "@/components/shared/error-states";
import { dismissCompetitiveOpportunity, refreshCompetitiveOpportunities, type CompetitiveOpportunityKind } from "@/lib/competitive-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { buildSwot, buildTrends, chip, opportunityKindLabel } from "@/lib/competitive-insights";
import { useCompetitiveData } from "../competitive-data";
import { Card, SkeletonBlock } from "../competitive-ui";

const ACTION: Record<CompetitiveOpportunityKind, { label: string; href: string }> = {
  keyword: { label: "Open tracked keywords", href: "/social/competitors" },
  review: { label: "Open reviews", href: "/reviews" },
  listing: { label: "Open listings", href: "/listings" },
  social: { label: "Open social", href: "/social" },
};

export function TrendsScreen() {
  const qc = useQueryClient();
  const data = useCompetitiveData();

  const trends = useMemo(() => buildTrends(data.input, data.events), [data.input, data.events]);
  const swot = useMemo(() => buildSwot(data.input, data.bench, data.events, data.stats), [data.input, data.bench, data.events, data.stats]);

  const refresh = useMutation({
    mutationFn: refreshCompetitiveOpportunities,
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: ["competitive-opportunities"] });
      void qc.invalidateQueries({ queryKey: ["competitive-recommendations"] });
      toast.success(n === 0 ? "No gaps found — nothing to act on right now." : `Found ${n} gap${n === 1 ? "" : "s"}.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't refresh right now."),
  });
  const dismiss = useMutation({
    mutationFn: dismissCompetitiveOpportunity,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["competitive-opportunities"] });
      void qc.invalidateQueries({ queryKey: ["competitive-recommendations"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't dismiss that."),
  });

  if (data.error) return <ErrorBanner title="Couldn't load competitors" onRetry={data.refetch} />;
  if (data.loading) return <SkeletonBlock h={280} />;

  return (
    <div className="flex flex-col gap-[15px]">
      {trends.length === 0 ? (
        <Card pad>
          <div className="text-[13px] font-extrabold text-[#101828]">No market patterns yet</div>
          <div className="mt-[7px] text-[12px] leading-[1.6] text-[#475467]">
            Trends are drawn from at least two rating snapshots, recorded price changes, or linked ad libraries. Add competitors and record what you see, and patterns
            will appear here — with how many data points each one rests on.
          </div>
        </Card>
      ) : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
          {trends.map((t) => {
            const c = chip(t.kind);
            return (
              <div key={t.title} className="rounded-[16px] border border-[#E6EAF0] bg-white p-4">
                <span className="rounded-[5px] px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[.4px]" style={{ background: c.bg, color: c.fg }}>
                  {t.kind}
                </span>
                <div className="mt-2.5 text-[13px] font-extrabold leading-[1.5] text-[#101828]">{t.title}</div>
                <div className="mt-[7px] text-[12px] leading-[1.6] text-[#475467]">{t.evidence}</div>
                <div className="mt-2 text-[11px] text-[#98A2B3]">
                  Confidence: {t.confidence} · {t.points} data point{t.points === 1 ? "" : "s"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        {swot.map((s) => (
          <div key={s.key} className="rounded-[16px] p-4" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
            <div className="mb-[11px] text-[12.5px] font-extrabold" style={{ color: s.color }}>
              {s.heading}
            </div>
            <div className="flex flex-col gap-2">
              {s.items.map((it) => (
                <div key={it} className="flex items-start gap-2">
                  <span className="mt-[7px] h-1 w-1 flex-none rounded-full" style={{ background: s.color }} />
                  <span className="text-[12px] leading-[1.55] text-[#344054]">{it}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Card pad>
        <div className="mb-[13px] flex flex-wrap items-center gap-2.5">
          <h3 className="m-0 text-[14.5px] font-extrabold text-[#101828]">What to do about it</h3>
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="ml-auto min-h-[36px] cursor-pointer rounded-[10px] border border-[#E6EAF0] bg-white px-3 text-[11.5px] font-bold text-[#0E8442] hover:border-[#12A150] hover:bg-[#F7FCF9] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refresh.isPending ? "Checking…" : "Check for gaps now"}
          </button>
        </div>
        {data.opportunities.length === 0 ? (
          <div className="rounded-[13px] border border-[#E6EAF0] p-3.5 text-[12.5px] leading-[1.65] text-[#475467]">
            Nothing open. Noxtill compares your keyword rankings, reviews, listings and social activity against your thresholds — press “Check for gaps now” to run it.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {data.opportunities.map((o) => {
              const a = ACTION[o.kind];
              return (
                <div key={o.id} className="rounded-[13px] border border-[#E6EAF0] p-3.5">
                  <div className="flex flex-wrap items-center gap-[9px]">
                    <span className="text-[13px] font-extrabold text-[#101828]">{o.evidence}</span>
                    <span className="text-[10px] font-bold text-[#98A2B3]">{opportunityKindLabel(o.kind)}</span>
                  </div>
                  {o.recommendation ? <div className="mt-[7px] text-[12.5px] leading-[1.65] text-[#475467]">{o.recommendation}</div> : null}
                  <div className="mt-[11px] flex flex-wrap gap-2">
                    <Link
                      href={a.href}
                      className="inline-flex min-h-[44px] items-center rounded-[10px] border border-[#E6EAF0] bg-white px-3.5 text-[12px] font-bold text-[#0E8442] hover:border-[#12A150] hover:bg-[#F7FCF9]"
                    >
                      {a.label}
                    </Link>
                    <button
                      type="button"
                      onClick={() => dismiss.mutate(o.id)}
                      disabled={dismiss.isPending}
                      className="min-h-[44px] cursor-pointer rounded-[10px] border border-[#E6EAF0] bg-white px-3.5 text-[12px] font-bold text-[#475467] hover:text-[#B42318]"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
