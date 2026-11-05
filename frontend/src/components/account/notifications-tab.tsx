"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { fetchHubCategory, toggleHubMatrix, type HubCategoryDetail } from "@/lib/settings-hub-api";
import { ErrorState, Skeleton, Toast, U, h2, section, sub, th, theadRow, tr } from "@/components/usage/usage-ui";

/**
 * The signed-in member's own notification matrix — the same real preferences (and the same
 * per-user write) as Settings hub → Notifications. Channels the app can't deliver yet are shown
 * disabled with the server's reason, never as working switches.
 */
export function NotificationsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings-hub", "category", "notifications"], queryFn: () => fetchHubCategory("notifications") });
  const [toast, setToast] = useState<string | null>(null);
  const toggle = useMutation({
    mutationFn: ({ event, channel, on }: { event: string; channel: string; on: boolean }) => toggleHubMatrix(event, channel, on),
    onMutate: async ({ event, channel, on }) => {
      const key = ["settings-hub", "category", "notifications"];
      const prev = qc.getQueryData<HubCategoryDetail>(key);
      if (prev?.matrix) {
        qc.setQueryData<HubCategoryDetail>(key, {
          ...prev,
          matrix: { ...prev.matrix, rows: prev.matrix.rows.map((r) => (r.event !== event ? r : { ...r, cells: r.cells.map((c) => (c.channel === channel ? { ...c, on } : c)) })) },
        });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["settings-hub", "category", "notifications"], ctx.prev);
      setToast(e instanceof ApiError ? e.message : "Couldn't save that change.");
      setTimeout(() => setToast(null), 4200);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["settings-hub", "category", "notifications"] }),
  });

  if (q.isLoading) return <Skeleton />;
  if (q.isError || !q.data?.matrix) return <ErrorState title="We couldn't load your settings" body="The settings service didn't respond. Nothing was changed." onRetry={() => q.refetch()} />;
  const m = q.data.matrix;
  const unavailable = m.channels.filter((c) => !c.available);

  return (
    <>
      <section style={{ ...section, overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={h2}>Notification preferences</h2>
            <p style={sub}>These apply to you only. Changes save automatically.</p>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 480 }}>
            <thead>
              <tr style={theadRow}>
                <th style={{ ...th, padding: "10px 20px" }}>Notify me about</th>
                {m.channels.map((c) => (
                  <th key={c.key} style={{ ...th, textAlign: "center", width: 90 }} title={c.reason ?? undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.event} style={tr}>
                  <td style={{ padding: "12px 20px" }}>
                    <div style={{ fontWeight: 700, color: U.text }}>{r.label}</div>
                    <div style={{ fontSize: 11.5, color: U.muted, marginTop: 2, textTransform: "capitalize" }}>{r.priority} priority</div>
                  </td>
                  {m.channels.map((ch) => {
                    const cell = r.cells.find((c) => c.channel === ch.key);
                    const disabled = !cell || cell.blocked || r.locked || !ch.available;
                    const on = !!cell?.on && ch.available;
                    return (
                      <td key={ch.key} style={{ padding: 12, textAlign: "center" }}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${r.label} — ${ch.label}`}
                          title={!ch.available ? (ch.reason ?? "Not available yet") : undefined}
                          disabled={disabled}
                          onClick={() => toggle.mutate({ event: r.event, channel: ch.key, on: !on })}
                          style={{ width: 38, height: 22, borderRadius: 22, border: 0, background: on ? U.green : "#D0D5DD", position: "relative", cursor: disabled ? "not-allowed" : "pointer", verticalAlign: "middle", padding: 0, opacity: disabled ? 0.45 : 1 }}
                        >
                          <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .15s ease", boxShadow: "0 1px 2px rgba(16,24,40,.2)" }} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {unavailable.length ? (
        <div style={{ fontSize: 12, color: U.text3, lineHeight: 1.55, padding: "0 4px" }}>
          {unavailable.map((c) => (
            <div key={c.key}>
              <strong style={{ color: U.text }}>{c.label}:</strong> {c.reason ?? "not available yet."}
            </div>
          ))}
        </div>
      ) : null}
      <Toast message={toast} />
    </>
  );
}
