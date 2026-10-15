"use client";

import { useQuery } from "@tanstack/react-query";
import type { EnrichedCall } from "@/lib/voice-calls-api";
import { fetchOutboundSummary, type OutboundActivityCounts } from "@/lib/voice-outbound-api";
import { ApiError } from "@/lib/api-client";
import { fetchVoiceAnalyticsTrends } from "@/lib/voice-analytics-trends-api";
import { Card, CardHead, Chip } from "./rx-ui";

export type HandlerFilter = "all" | "ai" | "person" | "unanswered";
export interface OverviewFilters {
  handler: HandlerFilter;
  /** "all", "none" (no published AI agent at call time) or an AI agent version id. */
  version: string;
}

export const DEFAULT_OVERVIEW_FILTERS: OverviewFilters = { handler: "all", version: "all" };

/** Applies the Overview filters to saved inbound calls; every field used is stored on the call. */
export function filterCalls(calls: EnrichedCall[], filters: OverviewFilters): EnrichedCall[] {
  return calls.filter((call) => {
    const person = call.handledBy === "human_joined" || call.handledBy === "ai_to_human" || call.humanAgentConnected;
    if (filters.handler === "ai" && (call.handledBy !== "ai" || person)) return false;
    if (filters.handler === "person" && !person) return false;
    if (filters.handler === "unanswered" && call.handledBy !== "none") return false;
    if (filters.version === "none" && call.aiAgentVersion) return false;
    if (filters.version !== "all" && filters.version !== "none" && call.aiAgentVersion?.id !== filters.version) return false;
    return true;
  });
}

const select = "h-8 rounded-[8px] border border-[#D5DAE2] bg-white px-2 text-[12px] font-semibold text-[#344054]";

export function OverviewFilterBar({ calls, filters, onChange }: { calls: EnrichedCall[]; filters: OverviewFilters; onChange: (next: OverviewFilters) => void }) {
  const versions = new Map<string, string>();
  for (const call of calls) {
    if (call.aiAgentVersion) versions.set(call.aiAgentVersion.id, `${call.aiAgentVersion.agentName} · v${call.aiAgentVersion.version}`);
  }
  const active = filters.handler !== "all" || filters.version !== "all";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[.08em] text-[#7A8798]">Inbound calls</span>
      <select aria-label="Who handled the call" className={select} value={filters.handler} onChange={(event) => onChange({ ...filters, handler: event.target.value as HandlerFilter })}>
        <option value="all">All handlers</option>
        <option value="ai">AI only</option>
        <option value="person">Reached a person</option>
        <option value="unanswered">Not answered</option>
      </select>
      <select aria-label="AI agent version" className={select} value={filters.version} onChange={(event) => onChange({ ...filters, version: event.target.value })}>
        <option value="all">All AI agent versions</option>
        <option value="none">No published agent</option>
        {[...versions.entries()].map(([id, label]) => (
          <option key={id} value={id}>{label}</option>
        ))}
      </select>
      {active ? (
        <>
          <Chip tone="blue">Filtered</Chip>
          <button type="button" onClick={() => onChange(DEFAULT_OVERVIEW_FILTERS)} className="cursor-pointer border-0 bg-transparent text-[11.5px] font-bold text-[#15803D]">Clear</button>
        </>
      ) : null}
    </div>
  );
}

/** Start of "today" in the business time zone, as an instant. */
function localMidnight(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return new Date(now.getTime() - ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 - now.getMilliseconds());
}

function Row({ label, counts }: { label: string; counts: OutboundActivityCounts }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] py-2.5 text-[12px]">
      <span className="font-bold text-[#334155]">{label}</span>
      <span className="flex flex-wrap gap-1.5">
        <Chip tone="neutral">{counts.attempts} tries</Chip>
        <Chip tone="blue">{counts.customerDialed} dialed</Chip>
        <Chip tone="green">{counts.connected} connected</Chip>
        {counts.blocked ? <Chip tone="red">{counts.blocked} blocked by checks</Chip> : null}
      </span>
    </div>
  );
}

/** Outbound activity today: human power dialer and missed-call call-backs (attempt rows only). */
export function OutboundTodayCard({ now, timeZone }: { now: Date; timeZone: string }) {
  const from = localMidnight(now, timeZone);
  const fromKey = from.toISOString().slice(0, 13);
  const summary = useQuery({
    queryKey: ["voice-outbound-summary", fromKey],
    queryFn: () => fetchOutboundSummary(from.toISOString()),
    refetchInterval: 30_000,
  });
  return (
    <Card overflow>
      <CardHead icon="phone-outgoing" iconColor="#15803D" title="Outbound today" right={<span className="text-[11px] text-[#94A3B8]">Dialer &amp; call-backs</span>} />
      {summary.isPending ? (
        <p className="m-0 px-[18px] py-3 text-[12px] text-[#7A8798]">Loading…</p>
      ) : summary.isError ? (
        <p className="m-0 px-[18px] py-3 text-[12px] text-[#B42318]">{summary.error.message}</p>
      ) : (
        <div className="divide-y divide-[#F3F4F7]">
          <Row label="Power dialer" counts={summary.data.powerDialer} />
          <Row label="Missed-call call-backs" counts={summary.data.callbacks} />
          <p className="m-0 px-[18px] py-2.5 text-[10.5px] leading-[1.5] text-[#94A3B8]">
            Counted from saved attempts. “Connected” means the provider confirmed the customer answered; manual dials from a staff phone are not recorded.
          </p>
        </div>
      )}
    </Card>
  );
}

/** Last 7 days of AI-only vs human-involved minutes and provider-priced spend (managers only). */
export function MinutesSpendCard() {
  const trends = useQuery({ queryKey: ["voice-analytics-trends", 7], queryFn: () => fetchVoiceAnalyticsTrends(7), retry: false });
  if (trends.error instanceof ApiError && trends.error.status === 403) return null;
  const totals = trends.data?.totals;
  return (
    <Card overflow>
      <CardHead icon="gauge" iconColor="#6D28D9" title="Minutes & spend" right={<span className="text-[11px] text-[#94A3B8]">Last 7 days</span>} />
      {trends.isPending ? (
        <p className="m-0 px-[18px] py-3 text-[12px] text-[#7A8798]">Loading…</p>
      ) : trends.isError || !totals ? (
        <p className="m-0 px-[18px] py-3 text-[12px] text-[#B42318]">{trends.error?.message ?? "Unavailable"}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 px-[18px] py-3 text-[12px]">
          <div>
            <div className="text-[16px] font-extrabold tabular-nums">{totals.aiOnlyMinutes}</div>
            <div className="text-[10.5px] text-[#7A8798]">AI-only minutes</div>
          </div>
          <div>
            <div className="text-[16px] font-extrabold tabular-nums">{totals.humanInvolvedMinutes}</div>
            <div className="text-[10.5px] text-[#7A8798]">Human-involved minutes</div>
          </div>
          <div>
            <div className="text-[16px] font-extrabold tabular-nums">{totals.pricedCalls ? totals.pricedCost.toFixed(2) : "—"}</div>
            <div className="text-[10.5px] text-[#7A8798]">{totals.pricedCalls ? `Provider-priced spend · ${totals.pricedCalls} calls` : "No calls priced yet"}</div>
          </div>
        </div>
      )}
    </Card>
  );
}
