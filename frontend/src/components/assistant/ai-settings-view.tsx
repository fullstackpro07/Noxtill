"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAiSettings, updateAiSettings, type AiFeatureToggles } from "@/lib/ai-settings-api";
import { formatCurrency } from "@/lib/format";
import { useAiAssistantDrawer } from "@/components/assistant/ai-assistant-drawer-context";
import { AI, KpiSkeleton, outlineBtnStyle, primaryBtnStyle } from "@/components/assistant/ai-assistant-ui";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";
import { NAV_ITEMS, type Role } from "@/lib/nav-items";

const ROLE_LABELS: Record<Role, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };
const ROLE_ORDER: Role[] = ["owner", "manager", "staff"];

/** Each AI feature's real reachable roles, derived live from `NAV_ITEMS` (the sidebar's own source
 * of truth) rather than a hand-maintained duplicate — if a module's role list ever changes, this
 * changes with it instead of silently drifting stale. A feature reachable from more than one real
 * entry point (e.g. What-If from both Profit and Products) shows the union of both, since either
 * path genuinely lets that role use it. */
const FEATURE_MODULE_KEYS: Record<keyof AiFeatureToggles, string[]> = {
  voiceEntry: ["ai-assistant"],
  photoDigitizer: ["digitizer"],
  reviewReplies: ["reviews"],
  // Real call sites of the `campaign_copy` AI kind: Social's AI Studio and Profit's dead-hours offer.
  campaignCopy: ["social", "profit"],
  insights: ["dashboard", "marketing"],
  whatIf: ["profit", "products"],
  assistant: ["ai-assistant"],
};

function availableToLabel(featureKey: keyof AiFeatureToggles): string {
  const roles = new Set<Role>();
  for (const moduleKey of FEATURE_MODULE_KEYS[featureKey]) {
    const item = NAV_ITEMS.find((i) => i.key === moduleKey);
    item?.roles.forEach((r) => roles.add(r));
  }
  return ROLE_ORDER.filter((r) => roles.has(r))
    .map((r) => ROLE_LABELS[r])
    .join(", ");
}

const FEATURE_LABELS: Record<keyof AiFeatureToggles, { name: string; note: string }> = {
  voiceEntry: { name: "Voice Entry", note: "Confirmation required before any write" },
  photoDigitizer: { name: "Photo Digitizer", note: "Extracts rows from a photo — staged for your review" },
  reviewReplies: { name: "Review Replies", note: "Drafts only — you approve before posting" },
  campaignCopy: { name: "Campaign Copy", note: "Never sends without approval" },
  insights: { name: "AI Insights", note: "Refreshes daily on your own data" },
  whatIf: { name: "What-If Simulation", note: "Labelled as simulation, never as actual" },
  assistant: { name: "Assistant & Help", note: "Business Chat and Help Assistant, read-only" },
};

/** Derived from the real, fixed tool registry (`backend/src/assistant/assistant-tools.ts`) — every
 * one of Business Chat's 23 read-only tools maps to one of these modules. There's no per-role
 * restriction on tool access today (any signed-in role can use Business Chat), so unlike the
 * design's mock, this list is genuinely the same for every role — that's disclosed below rather
 * than presented as a per-role matrix that doesn't exist. */
const DATA_ACCESS: { module: string; why: string }[] = [
  { module: "Fast Sale & Orders", why: "Today's and this month's revenue, order totals, top products" },
  { module: "Expenses & Profit", why: "This month's recorded expenses, alongside gross profit" },
  { module: "Inventory", why: "Which products are low, and by how much, against reorder points" },
  { module: "Credit", why: "Outstanding balances, and who owes the most" },
  { module: "Bookings", why: "Upcoming, today's and any given day's appointments, no-show rate" },
  { module: "Reviews", why: "Average rating, open complaints" },
  { module: "Marketing", why: "Campaign performance, messaging quota usage" },
  { module: "Staff", why: "Leaderboard by sales/appointments" },
  { module: "Customers", why: "New customers this month, top spenders, lookup by phone" },
  { module: "Help documentation", why: "Answers how-to questions from real Noxtill docs" },
];

export function AiSettingsView({ currency }: { currency: string }) {
  const session = useSession();
  const isOwner = session.user.role === "owner";
  const { openDisclosure, openLimits } = useAiAssistantDrawer();
  const queryClient = useQueryClient();

  const { data: settings, isPending, isError, error, refetch } = useQuery({ queryKey: ["ai-settings"], queryFn: fetchAiSettings, enabled: isOwner });

  const toggleMutation = useMutation({
    mutationFn: (key: keyof AiFeatureToggles) => updateAiSettings({ featureToggles: { [key]: !settings?.featureToggles[key] } }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["ai-settings"], updated);
      toast.success("AI Settings updated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this — please try again."),
  });

  if (!isOwner) {
    return (
      <main style={{ padding: "16px 22px 26px" }}>
        <div style={{ background: "#fff", border: "1px solid #FDE3B3", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#93370D" }}>AI Settings are owner-only</div>
          <div style={{ fontSize: 12.5, color: "#B54708", marginTop: 5 }}>Cost caps, rate limits and feature toggles apply business-wide, so only the owner can change them.</div>
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <div style={{ margin: 22, background: "#fff", border: "1px solid #FDD9D6", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#B42318" }}>{error instanceof ApiError ? error.message : "Couldn't load AI Settings"}</div>
        <button type="button" onClick={() => refetch()} style={{ marginTop: 15, border: 0, background: AI.primary, borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
          Retry
        </button>
      </div>
    );
  }

  const resetsDate = settings ? new Date(settings.usageThisMonth.limitResetsAt) : null;
  const resetsLabel = resetsDate ? `${resetsDate.getUTCDate()} ${resetsDate.toLocaleString("en-US", { month: "long", timeZone: "UTC" })}` : "";
  const maxWeekCount = settings ? Math.max(1, ...settings.queriesThisWeek.map((d) => d.count)) : 1;

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
        {isPending || !settings ? (
          <KpiSkeleton count={3} />
        ) : (
          <>
            <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 14, padding: 15 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>Queries this month</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginTop: 6 }}>{settings.usageThisMonth.totalCalls}</div>
              <div style={{ fontSize: 10.5, color: "#98A2B3", marginTop: 3 }}>of {settings.aiQueryQuota} on your plan</div>
            </div>
            <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 14, padding: 15 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>Plan usage</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginTop: 6 }}>{settings.usageThisMonth.queryQuotaUsedPercent}%</div>
              <div style={{ height: 7, borderRadius: 6, background: "#F2F4F7", overflow: "hidden", marginTop: 8 }}>
                <div style={{ height: "100%", borderRadius: 6, background: "#12A150", width: `${settings.usageThisMonth.queryQuotaUsedPercent}%` }} />
              </div>
            </div>
            <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 14, padding: 15 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>Limit resets</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginTop: 8 }}>{resetsLabel}</div>
              <div style={{ fontSize: 10.5, color: "#98A2B3", marginTop: 3 }}>Queries pause at the limit — nothing is charged silently</div>
            </div>
          </>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, padding: 17 }}>
        <h3 style={{ margin: "0 0 5px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Queries this week</h3>
        <div style={{ fontSize: 11, color: "#98A2B3", marginBottom: 13 }}>Counted per question asked, across all AI features</div>
        {isPending || !settings ? (
          <KpiSkeleton count={1} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {settings.queriesThisWeek.map((d) => (
              <div key={d.day} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 34, fontSize: 11.5, fontWeight: 700, color: "#344054" }}>{d.day}</span>
                <span style={{ flex: 1, height: 12, borderRadius: 6, background: "#F2F4F7", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", borderRadius: 6, background: "#BFE7CF", width: `${Math.round((d.count / maxWeekCount) * 100)}%` }} />
                </span>
                <span style={{ width: 34, fontSize: 12, fontWeight: 800, color: "#101828", textAlign: "right" }}>{d.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>AI features</h3>
        </div>
        {isPending || !settings ? (
          <div style={{ padding: 17 }}>
            <KpiSkeleton count={1} />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Feature</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Usage this month</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Available to</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Enabled</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(FEATURE_LABELS) as (keyof AiFeatureToggles)[]).map((key) => {
                  const usage = settings.usageThisMonth.byFeature[key];
                  const enabled = settings.featureToggles[key];
                  const statusLabel = enabled ? "Active" : "Off";
                  const statusBg = enabled ? "#E8F7EE" : "#F2F4F7";
                  const statusFg = enabled ? "#0E8442" : "#475467";
                  return (
                    <tr key={key} style={{ borderTop: "1px solid #F2F4F7" }}>
                      <td style={{ padding: "12px 17px" }}>
                        <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{FEATURE_LABELS[key].name}</span>
                        <span style={{ display: "block", fontSize: 11, color: "#98A2B3", marginTop: 3 }}>{FEATURE_LABELS[key].note}</span>
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467" }}>
                        {usage.calls} queries · {formatCurrency(usage.costUsd, currency)}
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "#667085" }}>{availableToLabel(key)}</td>
                      <td style={{ padding: 12 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: statusBg, color: statusFg }}>{statusLabel}</span>
                      </td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => toggleMutation.mutate(key)}
                          disabled={toggleMutation.isPending}
                          role="switch"
                          aria-checked={enabled}
                          aria-label={`Toggle ${FEATURE_LABELS[key].name}`}
                          style={{ width: 40, height: 22, border: 0, borderRadius: 20, background: enabled ? AI.primary : "#D5DCE4", position: "relative", cursor: "pointer" }}
                        >
                          <span style={{ position: "absolute", top: 2, left: enabled ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {settings.usageThisMonth.other.calls > 0 && (
                  <tr style={{ borderTop: "1px solid #F2F4F7", background: "#FAFBFC" }}>
                    <td style={{ padding: "12px 17px", fontSize: 12.5, color: "#98A2B3" }}>Other AI usage</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "#98A2B3" }}>
                      {settings.usageThisMonth.other.calls} queries · {formatCurrency(settings.usageThisMonth.other.costUsd, currency)}
                    </td>
                    <td style={{ padding: 12 }} />
                    <td style={{ padding: 12 }} />
                    <td style={{ padding: "12px 17px", textAlign: "right", fontSize: 11, color: "#98A2B3" }}>not independently toggleable</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>What the assistant can read</h3>
          <span style={{ fontSize: 11, color: "#98A2B3" }}>Same for every role today</span>
        </div>
        <div style={{ padding: "6px 0" }}>
          {DATA_ACCESS.map((d) => (
            <div key={d.module} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 17px", borderBottom: "1px solid #F2F4F7", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 140, fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{d.module}</span>
              <span style={{ fontSize: 11.5, color: "#98A2B3" }}>{d.why}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: "#E8F7EE", color: "#0E8442", whiteSpace: "nowrap" }}>Available</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "11px 17px", fontSize: 11.5, color: "#98A2B3", lineHeight: 1.55 }}>
          There&apos;s no per-role restriction on Business Chat&apos;s tools yet — owner, manager and staff all read the same modules listed above.
        </div>
      </div>

      <div style={{ background: "#fff", border: "1.5px solid #BFE7CF", borderRadius: 16, padding: 17 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Action governance</h3>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#0E8442", background: "#E8F7EE", borderRadius: 6, padding: "3px 8px" }}>Read-only by default</span>
        </div>
        <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: 12, padding: 13, marginTop: 12, fontSize: 12.5, color: "#344054", lineHeight: 1.65 }}>
          The assistant can analyse, explain and draft. Voice Assistant can stage a curated set of writes — wastage, expenses, new customers, cash-drawer movements — and always waits for your confirmation before anything is applied. It cannot send a message, adjust stock or change a price on its own outside that reviewed flow.
        </div>
        <div style={{ display: "flex", gap: 9, marginTop: 13, flexWrap: "wrap" }}>
          <button type="button" onClick={openDisclosure} style={outlineBtnStyle}>
            How Noxtill uses AI
          </button>
          <button type="button" onClick={openLimits} style={{ ...primaryBtnStyle, marginLeft: "auto" }}>
            Cost cap &amp; rate limit
          </button>
        </div>
      </div>
    </main>
  );
}
