"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Target, Pencil } from "lucide-react";
import { fetchRevenueSeries } from "@/lib/analytics-api";
import { fetchBusinessGoal, updateBusinessGoal } from "@/lib/business-goal-api";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

function GoalProgressBar({ label, value, target }: { label: string; value: string; target: string; }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11.5px]">
        <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>{label}</span>
        <span className="font-bold" style={{ color: "var(--app-text)" }}>{value} / {target}</span>
      </div>
    </div>
  );
}

/** Real anomaly: compares yesterday's revenue against the trailing 7-day average from the same
 * /analytics/revenue-series data used by the trend chart — a genuine statistical comparison, not
 * an AI-generated explanation. "Today's Goals" fix-it: a real, persisted standing daily target
 * (GET/PATCH /dashboard/goals) tracked against today's real revenue/orders — both already present
 * in this component's own revenue-series fetch, so no extra query is needed for the comparison. */
export function NeedsAttentionCard({ currency }: { currency: string }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const canManageGoal = session.user.role !== "staff";
  const [editing, setEditing] = useState(false);
  const [draftRevenue, setDraftRevenue] = useState("");
  const [draftOrders, setDraftOrders] = useState("");

  const { data, isPending } = useQuery({ queryKey: ["revenue-series", 8], queryFn: () => fetchRevenueSeries(8) });
  const { data: goal } = useQuery({ queryKey: ["business-goal"], queryFn: fetchBusinessGoal });

  const mutation = useMutation({
    mutationFn: () =>
      updateBusinessGoal({
        dailyRevenueTarget: Number(draftRevenue) || 0,
        dailyOrdersTarget: draftOrders.trim() === "" ? null : Number(draftOrders),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-goal"] });
      toast.success("Daily goal saved.");
      setEditing(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save the goal — please try again."),
  });

  function openEditor() {
    setDraftRevenue(goal?.isSet ? String(goal.dailyRevenueTarget) : "");
    setDraftOrders(goal?.isSet && goal.dailyOrdersTarget !== null ? String(goal.dailyOrdersTarget) : "");
    setEditing(true);
  }

  const today = data && data.length > 0 ? data[data.length - 1] : null;

  const anomaly = (() => {
    if (!data || data.length < 8) return null;
    const last = data[data.length - 1];
    const trailing7 = data.slice(0, 7);
    const avg = trailing7.reduce((s, d) => s + d.revenue, 0) / trailing7.length;
    if (avg <= 0) return null;
    const deltaPct = ((last.revenue - avg) / avg) * 100;
    if (Math.abs(deltaPct) < 20) return null;
    return { date: last.date, revenue: last.revenue, avg, deltaPct };
  })();

  return (
    <section className="rounded-[14px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <h2 className="mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Needs Attention</h2>
      <div className="flex flex-col gap-2.5">
        {isPending ? (
          <div className="h-[76px] animate-pulse rounded-[12px]" style={{ background: "var(--app-surface-2)" }} />
        ) : !anomaly ? (
          <p className="py-4 text-center text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Nothing unusual in recent sales.</p>
        ) : (
          <div
            className="rounded-[12px] p-3"
            style={{
              border: anomaly.deltaPct < 0 ? "1px solid var(--app-warning-border)" : "1px solid var(--app-success-border)",
              background: anomaly.deltaPct < 0 ? "#FFFBF2" : "var(--app-success-bg)",
            }}
          >
            <p className="text-[12.5px] font-bold" style={{ color: anomaly.deltaPct < 0 ? "var(--app-warning-text)" : "var(--app-success-text)" }}>
              Sales on {new Date(anomaly.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} were{" "}
              {Math.abs(anomaly.deltaPct).toFixed(0)}% {anomaly.deltaPct < 0 ? "below" : "above"} your 7-day average
            </p>
            <div className="mt-1.5 flex gap-3 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
              <span>7-day avg: {formatCurrency(anomaly.avg, currency)}</span>
              <span className="font-bold" style={{ color: "var(--app-text)" }}>That day: {formatCurrency(anomaly.revenue, currency)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--app-surface-2)" }}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5" style={{ color: "var(--app-text-faintest)" }} aria-hidden />
            <h3 className="text-[13px] font-bold" style={{ color: "var(--app-text)" }}>Today's Goals</h3>
          </span>
          {canManageGoal && !editing && (
            <button type="button" onClick={openEditor} className="flex items-center gap-1 text-[11px] font-bold" style={{ color: "var(--app-primary)" }}>
              <Pencil className="h-3 w-3" aria-hidden />
              {goal?.isSet ? "Edit" : "Set goal"}
            </button>
          )}
        </div>

        {editing ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
              Daily revenue target
              <input
                type="number"
                min={0}
                value={draftRevenue}
                onChange={(e) => setDraftRevenue(e.target.value)}
                placeholder="e.g. 500"
                className="rounded-[8px] px-2.5 py-1.5 text-[12.5px]"
                style={{ border: "1px solid var(--app-border)", color: "var(--app-text)" }}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
              Daily orders target (optional)
              <input
                type="number"
                min={0}
                value={draftOrders}
                onChange={(e) => setDraftOrders(e.target.value)}
                placeholder="e.g. 20"
                className="rounded-[8px] px-2.5 py-1.5 text-[12.5px]"
                style={{ border: "1px solid var(--app-border)", color: "var(--app-text)" }}
              />
            </label>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className="flex-1 rounded-[8px] py-1.5 text-[11.5px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || draftRevenue.trim() === ""}
                className="flex-1 rounded-[8px] py-1.5 text-[11.5px] font-bold text-white disabled:opacity-60"
                style={{ background: "var(--app-primary)" }}
              >
                {mutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : !goal?.isSet ? (
          <p className="text-[11.5px] leading-normal" style={{ color: "var(--app-text-faintest)" }}>
            {canManageGoal ? "No daily goal set yet — set one to track progress here." : "No daily goal set yet."}
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <GoalProgressBar
              label="Revenue"
              value={formatCurrency(today?.revenue ?? 0, currency)}
              target={formatCurrency(goal.dailyRevenueTarget, currency)}
            />
            <div className="h-[6px] w-full overflow-hidden rounded-full" style={{ background: "var(--app-surface-2)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, goal.dailyRevenueTarget > 0 ? ((today?.revenue ?? 0) / goal.dailyRevenueTarget) * 100 : 0)}%`,
                  background: "var(--app-primary)",
                }}
              />
            </div>
            {goal.dailyOrdersTarget !== null && (
              <>
                <GoalProgressBar
                  label="Orders"
                  value={formatNumber(today?.orders ?? 0)}
                  target={formatNumber(goal.dailyOrdersTarget)}
                />
                <div className="h-[6px] w-full overflow-hidden rounded-full" style={{ background: "var(--app-surface-2)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, goal.dailyOrdersTarget > 0 ? ((today?.orders ?? 0) / goal.dailyOrdersTarget) * 100 : 0)}%`,
                      background: "var(--app-info, #2563EB)",
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
