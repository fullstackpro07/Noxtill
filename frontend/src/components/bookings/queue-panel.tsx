"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { fetchQueue, joinQueue, callQueueToken, serveQueueToken, skipQueueToken, type QueueToken } from "@/lib/queue-api";
import { fetchProducts } from "@/lib/products-api";
import { useNow } from "@/hooks/use-now";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";

const STATUS_TONE: Record<QueueToken["status"], { bg: string; fg: string }> = {
  waiting: { bg: "var(--app-surface-2)", fg: "var(--app-text-muted)" },
  called: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  serving: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  served: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  skipped: { bg: "#FEE4E2", fg: "var(--app-danger-strong)" },
  cancelled: { bg: "var(--app-surface-2)", fg: "var(--app-text-disabled)" },
};

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryHeaderBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 20px", fontSize: 13, fontWeight: 800, color: "#fff", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };

function waitMinutes(t: QueueToken, now: number): number {
  const start = new Date(t.createdAt).getTime();
  const end = t.servedAt ? new Date(t.servedAt).getTime() : t.calledAt ? new Date(t.calledAt).getTime() : now;
  return Math.max(0, Math.round((end - start) / 60_000));
}

/** No multi-queue concept exists on the backend (`QueueToken` has no queue name/type field) and
 * there's no reset/settings/public-QR-join endpoint either — this screen is scoped to exactly what
 * `/queue` supports: one shared queue per business, joined from inside the app. */
export function QueuePanel() {
  const queryClient = useQueryClient();
  const [joining, setJoining] = useState(false);
  const now = useNow();

  const { data: tokens, isPending, refetch } = useQuery({ queryKey: ["queue"], queryFn: () => fetchQueue(), refetchInterval: 15_000 });

  const nowServing = (tokens ?? []).find((t) => t.status === "called" || t.status === "serving");
  const waiting = (tokens ?? []).filter((t) => t.status === "waiting");
  const servedToday = (tokens ?? []).filter((t) => t.status === "served");
  const done = (tokens ?? []).filter((t) => ["served", "skipped", "cancelled"].includes(t.status));
  const avgWait = servedToday.length > 0 ? Math.round(servedToday.reduce((sum, t) => sum + waitMinutes(t, now), 0) / servedToday.length) : 0;

  const callMutation = useMutation({
    mutationFn: (id: string) => callQueueToken(id),
    onSuccess: (t) => { queryClient.invalidateQueries({ queryKey: ["queue"] }); toast.success(`Calling token #${t.number}.`); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't call this token."),
  });
  const serveMutation = useMutation({
    mutationFn: (id: string) => serveQueueToken(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["queue"] }); toast.success("Marked as served."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this token."),
  });
  const skipMutation = useMutation({
    mutationFn: (id: string) => skipQueueToken(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["queue"] }); toast.success("Token skipped."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this token."),
  });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Queue</h2>
        <div className="ms-auto flex flex-wrap gap-2.5">
          <button type="button" onClick={() => refetch()} style={outlineBtn}>Refresh</button>
          <button type="button" onClick={() => setJoining(true)} style={outlineBtn}>Add to Queue</button>
          <button type="button" onClick={() => nowServing && serveMutation.mutate(nowServing.id)} disabled={!nowServing || serveMutation.isPending} style={{ ...primaryHeaderBtn, opacity: !nowServing ? 0.5 : 1 }}>Call Next</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "330px minmax(0,1fr)", alignItems: "start" }}>
        <div className="rounded-[18px] p-[26px_20px] text-center" style={{ background: "var(--app-sidebar-bg)" }}>
          <div className="text-[11.5px] font-extrabold uppercase tracking-[1px]" style={{ color: "#8FF0BB" }}>Now Serving</div>
          <div className="mt-2 text-[64px] font-extrabold leading-none tracking-[-2px] text-white">{nowServing ? `#${nowServing.number}` : "—"}</div>
          {nowServing ? (
            <div className="mt-1.5 text-[12.5px] font-semibold" style={{ color: "#AFC0CE" }}>{nowServing.customerName}</div>
          ) : (
            <div className="mt-1.5 text-[12.5px]" style={{ color: "#AFC0CE" }}>No one is being called right now</div>
          )}
        </div>
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
          <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Waiting</div>
            <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{waiting.length}</div>
          </div>
          <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Average Wait</div>
            <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{avgWait}m</div>
          </div>
          <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Served Today</div>
            <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{servedToday.length}</div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {!isPending && waiting.length === 0 && done.length === 0 ? (
          <div className="p-[72px_18px] text-center">
            <div className="text-[22px] font-extrabold" style={{ color: "var(--app-text-muted)", letterSpacing: "-.5px" }}>No one waiting</div>
            <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Customers appear here when they&apos;re added to the queue.</div>
            <button type="button" onClick={() => setJoining(true)} className="mt-4 rounded-[12px] px-5 py-3 text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Add to Queue</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Token</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Service</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Joined At</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Waited For</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...waiting, ...done].map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="p-[12px_17px] text-[15px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.3px" }}>#{t.number}</td>
                    <td className="p-[12px] text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{t.customerName}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{t.serviceName ?? "—"}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{new Date(t.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td>
                    <td className="p-[12px] text-end text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{waitMinutes(t, now)}m</td>
                    <td className="p-[12px]"><span className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: STATUS_TONE[t.status].bg, color: STATUS_TONE[t.status].fg }}>{t.status}</span></td>
                    <td className="p-[12px_17px] text-end">
                      {t.status === "waiting" && (
                        <span className="inline-flex flex-wrap justify-end gap-1.5">
                          <button type="button" onClick={() => callMutation.mutate(t.id)} disabled={callMutation.isPending} style={smallOutline}>Call</button>
                          <button type="button" onClick={() => skipMutation.mutate(t.id)} disabled={skipMutation.isPending} style={smallOutline}>Skip</button>
                        </span>
                      )}
                      {t.status === "called" && (
                        <button type="button" onClick={() => serveMutation.mutate(t.id)} disabled={serveMutation.isPending} style={{ border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", minHeight: 40 }}>Serve</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <JoinQueueModal open={joining} onClose={() => setJoining(false)} />
    </main>
  );
}

function JoinQueueModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [serviceId, setServiceId] = useState("");
  const queryClient = useQueryClient();
  const { data: services } = useQuery({ queryKey: ["products", "service"], queryFn: () => fetchProducts({ kind: "service" }), enabled: open });

  const mutation = useMutation({
    mutationFn: () => joinQueue({ customerName, serviceId: serviceId || undefined }),
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast.success(`${t.customerName} added as token #${t.number}.`);
      setCustomerName("");
      setServiceId("");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this walk-in to the queue."),
  });

  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title="Add to Queue"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!customerName.trim() || mutation.isPending} style={{ ...primaryBtn, opacity: !customerName.trim() || mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Adding…" : "Add to Queue"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>CUSTOMER</span>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Name or leave blank for Guest" className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>SERVICE</span>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            <option value="">Not specified</option>
            {(services ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      </div>
    </PosModalShell>
  );
}
