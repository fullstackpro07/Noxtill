"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  approveAction,
  cancelAction,
  fetchActions,
  fetchDecisions,
  fetchGovernance,
  fetchHistory,
  fetchMemory,
  fetchOutlook,
  restoreFinding,
  runAction,
  setBrainRule,
  type BrainAction,
  type FindingCard,
} from "@/lib/brain-api";
import { useBrainScope, useBrainStore } from "./brain-store";
import { useFindingActions } from "./finding-actions";
import { Btn, CONF, Empty, Icon, InfoBanner, Loading, PRIO, SectionHead, card, errorText, iconFor, useBrainInvalidate } from "./brain-ui";

function Kpi({ l, v, sub, color = "#0F172A", bd = "#E6EAF0" }: { l: string; v: string; sub?: string; color?: string; bd?: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${bd}`, borderRadius: "14px", padding: "15px" }}>
      <div style={{ fontSize: "12px", fontWeight: 600, color: "#475467" }}>{l}</div>
      <div style={{ fontSize: "21px", fontWeight: 800, color, marginTop: "6px" }}>{v}</div>
      {sub && <div style={{ fontSize: "10.5px", color: "#98A2B3", marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}

function Row({ l, v, sub, href }: { l: string; v: string; sub?: string; href?: string }) {
  const body = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{l}</span>
        {sub && <span style={{ display: "block", fontSize: "11px", color: "#98A2B3", marginTop: "3px" }}>{sub}</span>}
      </span>
      <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#0F172A", flex: "0 0 auto" }}>{v}</span>
    </>
  );
  const style = { display: "flex", alignItems: "center", gap: "11px", padding: "12px 17px", borderBottom: "1px solid #F2F4F7", textDecoration: "none" } as const;
  return href ? (
    <Link href={href} className="bb-row" style={style}>
      {body}
    </Link>
  ) : (
    <div style={style}>{body}</div>
  );
}

// ─── Outlook ─────────────────────────────────────────────────────────────

export function OutlookView() {
  const scope = useBrainScope();
  const { data, isLoading, error } = useQuery({ queryKey: ["brain-outlook", scope], queryFn: () => fetchOutlook(scope) });
  if (isLoading) return <Loading />;
  if (error || !data) return <div style={card}><Empty title="Could not read the outlook" sub={errorText(error)} /></div>;
  const pts = data.cash.points;
  const min = Math.min(0, ...pts.map((p) => p.v));
  const max = Math.max(1, ...pts.map((p) => p.v));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${(i / Math.max(1, pts.length - 1)) * 600},${120 - ((p.v - min) / (max - min || 1)) * 110}`).join(" ");
  const zeroY = 120 - ((0 - min) / (max - min || 1)) * 110;
  const bkCh = data.bookings.last7 ? Math.round(((data.bookings.next7 - data.bookings.last7) / data.bookings.last7) * 100) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <InfoBanner>Everything here looks forward from records you already have. Projections say what they are projected from — none of them is a promise.</InfoBanner>
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "14px" }}>
        <Kpi l="Average revenue a day" v={data.cash.dailyRevenue} sub="Trailing 30 days" />
        {data.cash.expensesRecorded ? (
          <Kpi l="Average expenses a day" v={data.cash.dailyExpense} sub={`Trailing 30 days, ${data.cash.expensesRecorded} recorded`} />
        ) : (
          <Kpi l="Average expenses a day" v="None recorded" sub="No expense in the last 30 days" color="#B54708" bd="#FDE3B3" />
        )}
        <Kpi l="Projected net, next 30 days" v={data.cash.net30} sub={data.cash.shortfalls.length ? `Turns negative ${data.cash.shortfalls[0]}` : data.cash.expensesRecorded ? "Stays positive" : "Before expenses — none are recorded"} color={data.cash.netPositive ? "#0E8442" : "#B42318"} bd={data.cash.netPositive ? "#D5EFE0" : "#FDD9D6"} />
        <Kpi l="Bookings next 7 days" v={String(data.bookings.next7)} sub={bkCh === null ? `${data.bookings.last7} in the last 7 days` : `${bkCh >= 0 ? "+" : ""}${bkCh}% on the last 7 days`} />
      </div>
      <section style={{ ...card, padding: "17px" }}>
        <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Cash over the next 30 days</h3>
        <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>{data.cash.basis}</div>
        {pts.length > 1 ? (
          <svg viewBox="0 0 600 125" preserveAspectRatio="none" style={{ width: "100%", height: "140px", marginTop: "14px" }} aria-label="Projected cumulative net cash">
            <line x1="0" x2="600" y1={zeroY} y2={zeroY} stroke="#E6EAF0" strokeDasharray="4 4" />
            <path d={path} fill="none" stroke={data.cash.netPositive ? "#12A150" : "#F04438"} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <Empty title="Not enough history to project" />
        )}
      </section>
      <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "15px", alignItems: "start" }}>
        <section style={{ ...card, overflow: "hidden" }}>
          <SectionHead title="Stock that runs out in the next 14 days" sub="At the 14-day sales rate. Dates are estimates." />
          {data.runouts.length === 0 && <Empty title="Nothing runs out in the next two weeks" />}
          {data.runouts.map((r) => (
            <Row key={r.n} l={r.n} sub={`${r.stock} left, about ${r.perDay} a day`} v={r.days === 0 ? "Out now" : `~${r.date}`} href="/inventory/low-stock" />
          ))}
        </section>
        <section style={{ ...card, overflow: "hidden" }}>
          <SectionHead title="Credit about to become overdue" sub="Balances that pass your overdue limit within a week." />
          {data.soonOverdue.length === 0 && <Empty title="No balance is about to become overdue" />}
          {data.soonOverdue.map((r) => (
            <Row key={r.customerId} l={r.n} sub={`Overdue in ${r.inDays} day${r.inDays === 1 ? "" : "s"}`} v={r.balance} href={`/credit/${r.customerId}`} />
          ))}
        </section>
        <section style={{ ...card, overflow: "hidden" }}>
          <SectionHead title="Bills due in the next 30 days" sub="Your recurring obligations." />
          {data.obligations.length === 0 && <Empty title="No recurring bills due" sub="Add recurring obligations in Profit & Analytics to see them here." />}
          {data.obligations.map((o) => (
            <Row key={`${o.n}-${o.due}`} l={o.n} sub={`Due ${o.due}`} v={o.amount} href="/profit" />
          ))}
        </section>
        <section style={{ ...card, overflow: "hidden" }}>
          <SectionHead title="Quotations expiring this week" sub="Sent, not yet answered." />
          {data.quotesExpiring.length === 0 && <Empty title="No quotation expires this week" />}
          {data.quotesExpiring.map((o) => (
            <Row key={o.n} l={o.n} sub={`Valid until ${o.until}`} v={o.total} href="/orders/quotations" />
          ))}
        </section>
      </div>
    </div>
  );
}

// ─── Decisions ───────────────────────────────────────────────────────────

function FindingRow({ f }: { f: FindingCard }) {
  const store = useBrainStore();
  const fa = useFindingActions();
  const p = PRIO[f.kind];
  return (
    <div style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", gap: "13px", alignItems: "flex-start" }}>
      <span style={{ width: "34px", height: "34px", borderRadius: "11px", background: p.bg, color: p.fg, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 34px" }}>
        <Icon d={iconFor(f.key)} size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: p.fg, background: p.bg, borderRadius: "5px", padding: "3px 7px" }}>{f.kind}</span>
          <span style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>{f.t}</span>
        </div>
        <div style={{ fontSize: "12px", color: "#475467", marginTop: "6px", lineHeight: 1.55 }}>
          Recommended: {f.rec}. <span style={{ color: "#98A2B3" }}>{f.recWhy}</span>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "11px" }}>
          <Btn primary onClick={() => fa.primary(f)} disabled={fa.prepare.isPending}>
            {fa.primaryLabel(f)}
          </Btn>
          <Btn onClick={() => fa.watch.mutate(f)}>Watch it</Btn>
          <Btn onClick={() => fa.dismiss(f)}>Dismiss with a reason</Btn>
          <Btn onClick={() => store.openDrawer({ type: "finding", card: f })}>Look into it</Btn>
        </div>
      </div>
    </div>
  );
}

const DECISION: Record<string, { l: string; bg: string; fg: string }> = {
  prepared: { l: "Prepared", bg: "#EEF4FF", fg: "#3538CD" },
  approved: { l: "Approved", bg: "#E8F7EE", fg: "#0E8442" },
  ran: { l: "Ran", bg: "#E8F7EE", fg: "#0E8442" },
  failed: { l: "Failed", bg: "#FEF3F2", fg: "#B42318" },
  cancelled: { l: "Cancelled", bg: "#F2F4F7", fg: "#475467" },
  watched: { l: "Watching", bg: "#EEF4FF", fg: "#3538CD" },
  dismissed: { l: "Dismissed", bg: "#F2F4F7", fg: "#475467" },
  restored: { l: "Restored", bg: "#F2F4F7", fg: "#475467" },
  rule: { l: "Rule changed", bg: "#FEF6E7", fg: "#B54708" },
};

export function DecisionsView() {
  const scope = useBrainScope();
  const { data, isLoading, error } = useQuery({ queryKey: ["brain-decisions", scope], queryFn: () => fetchDecisions(scope) });
  if (isLoading) return <Loading />;
  if (error || !data) return <div style={card}><Empty title="Could not read decisions" sub={errorText(error)} /></div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <section style={{ ...card, overflow: "hidden" }}>
        <SectionHead title="Waiting for a decision" sub="Critical and attention findings nobody has acted on, watched or dismissed yet." right={<span style={{ fontSize: "10.5px", fontWeight: 800, color: "#B54708", background: "#FEF6E7", borderRadius: "20px", padding: "4px 10px" }}>{data.pending.length} waiting</span>} />
        {data.pending.length === 0 && <Empty title="Nothing is waiting on you" sub="Every finding has been acted on, watched or dismissed." />}
        {data.pending.map((f) => (
          <FindingRow key={f.key} f={f} />
        ))}
      </section>
      <section style={{ ...card, overflow: "hidden" }}>
        <SectionHead title="Decision log" sub="Every preparation, approval, run, watch and dismissal, with a name against it. Nothing is removed." />
        {data.log.length === 0 && <Empty title="No decisions recorded yet" />}
        {data.log.map((l) => {
          const d = DECISION[l.decision] ?? { l: l.decision, bg: "#F2F4F7", fg: "#475467" };
          return (
            <div key={l.id} style={{ padding: "12px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <span style={{ fontSize: "10.5px", color: "#98A2B3", width: "120px", flex: "0 0 auto", paddingTop: "2px" }}>{l.when}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{l.t}</span>
                <span style={{ display: "block", fontSize: "11px", color: "#667085", marginTop: "3px" }}>
                  {l.who}
                  {l.reason ? ` — ${l.reason}` : ""}
                </span>
              </span>
              <span style={{ fontSize: "10.5px", fontWeight: 800, color: d.fg, background: d.bg, borderRadius: "20px", padding: "4px 10px", flex: "0 0 auto" }}>{d.l}</span>
            </div>
          );
        })}
      </section>
    </div>
  );
}

// ─── Action Center ───────────────────────────────────────────────────────

const STATUS: Record<BrainAction["status"], { l: string; bg: string; fg: string }> = {
  prepared: { l: "Waiting for approval", bg: "#FEF6E7", fg: "#B54708" },
  approved: { l: "Approved — ready to run", bg: "#EEF4FF", fg: "#3538CD" },
  blocked: { l: "Blocked", bg: "#FEF3F2", fg: "#B42318" },
  done: { l: "Done", bg: "#E8F7EE", fg: "#0E8442" },
  failed: { l: "Failed", bg: "#FEF3F2", fg: "#B42318" },
  cancelled: { l: "Cancelled", bg: "#F2F4F7", fg: "#475467" },
};
const ACTION_FILTERS: { k: string; statuses: BrainAction["status"][] }[] = [
  { k: "Waiting", statuses: ["prepared", "blocked"] },
  { k: "Approved", statuses: ["approved"] },
  { k: "Finished", statuses: ["done", "failed", "cancelled"] },
];

export function ActionsView() {
  const store = useBrainStore();
  const invalidate = useBrainInvalidate();
  const [filter, setFilter] = useState("Waiting");
  const { data, isLoading, error } = useQuery({ queryKey: ["brain-actions"], queryFn: fetchActions });
  const onErr = (e: unknown) => {
    store.flash(errorText(e));
    void invalidate();
  };
  const approve = useMutation({ mutationFn: approveAction, onSuccess: () => { store.flash("Approved. Press Run when you are ready."); void invalidate(); }, onError: onErr });
  const run = useMutation({ mutationFn: runAction, onSuccess: (r) => { store.flash(r.result); void invalidate(); }, onError: onErr });
  const cancel = useMutation({ mutationFn: cancelAction, onSuccess: () => { store.flash("Cancelled. Nothing was sent or changed."); void invalidate(); }, onError: onErr });
  if (isLoading) return <Loading />;
  if (error || !data) return <div style={card}><Empty title="Could not read the Action Center" sub={errorText(error)} /></div>;
  const f = ACTION_FILTERS.find((x) => x.k === filter)!;
  const rows = data.filter((a) => f.statuses.includes(a.status));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <InfoBanner tone="amber">Business Brain prepares; a person approves; a person runs. Each action needs the permission of the module it acts in, and every step is written to the decision log.</InfoBanner>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {ACTION_FILTERS.map((x) => {
          const on = x.k === filter;
          const n = data.filter((a) => x.statuses.includes(a.status)).length;
          return (
            <button key={x.k} type="button" onClick={() => setFilter(x.k)} style={{ display: "flex", alignItems: "center", gap: "7px", border: `1px solid ${on ? "#12A150" : "#E6EAF0"}`, background: on ? "#F7FCF9" : "#fff", color: on ? "#0E8442" : "#475467", borderRadius: "20px", padding: "9px 14px", fontSize: "12px", fontWeight: 700, cursor: "pointer", minHeight: "42px" }}>
              {x.k}
              <span style={{ fontSize: "10.5px", opacity: 0.7 }}>{n}</span>
            </button>
          );
        })}
      </div>
      {rows.length === 0 && <div style={card}><Empty title={filter === "Waiting" ? "Nothing is waiting" : filter === "Approved" ? "Nothing approved and waiting to run" : "Nothing finished yet"} sub="Prepare an action from a finding on the Command Center or Opportunity & Risk." /></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: "14px" }}>
        {rows.map((a) => {
          const s = STATUS[a.status];
          const messageAction = a.body !== null;
          return (
            <div key={a.id} style={{ background: "#fff", border: `1px solid ${a.status === "blocked" || a.status === "failed" ? "#FDD9D6" : "#E6EAF0"}`, borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "11px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#475467", background: "#F2F4F7", borderRadius: "5px", padding: "3px 7px" }}>{a.typeLabel}</span>
                <span style={{ marginLeft: "auto", fontSize: "10.5px", fontWeight: 800, color: s.fg, background: s.bg, borderRadius: "20px", padding: "4px 10px" }}>{s.l}</span>
              </div>
              <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>{a.title}</div>
              <div style={{ fontSize: "11.5px", color: "#475467", lineHeight: 1.55 }}>{a.detail}</div>
              {a.body !== null && (
                <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: "11px", padding: "11px 12px", fontSize: "12px", color: "#101828", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                  {a.body}
                  {a.recipients !== null && <div style={{ fontSize: "10.5px", color: "#0E8442", marginTop: "6px" }}>To {a.recipients} customer{a.recipients === 1 ? "" : "s"}</div>}
                </div>
              )}
              {a.blockedReason && <div style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: "10px", padding: "9px 11px", fontSize: "11px", fontWeight: 700, color: "#912018", lineHeight: 1.5 }}>{a.blockedReason}</div>}
              {a.result && <div style={{ background: a.status === "failed" ? "#FEF3F2" : "#F7FCF9", border: `1px solid ${a.status === "failed" ? "#FDD9D6" : "#D5EFE0"}`, borderRadius: "10px", padding: "9px 11px", fontSize: "11px", fontWeight: 700, color: a.status === "failed" ? "#912018" : "#0E8442", lineHeight: 1.5 }}>{a.result}</div>}
              <div style={{ fontSize: "10.5px", color: "#98A2B3", lineHeight: 1.6 }}>
                Needs: {a.perm}. Prepared by {a.preparedBy ?? "Business Brain"}
                {a.approvedBy ? ` · approved by ${a.approvedBy}` : ""}
                {a.executedAt ? ` · ran ${new Date(a.executedAt).toLocaleString()}` : ""}
              </div>
              <div style={{ display: "flex", gap: "7px", flexWrap: "wrap", borderTop: "1px solid #F2F4F7", paddingTop: "11px" }}>
                {a.status === "prepared" && (
                  <Btn primary disabled={!a.canApprove || approve.isPending} title={a.canApprove ? undefined : `Needs ${a.perm}`} onClick={() => approve.mutate(a.id)}>
                    Approve
                  </Btn>
                )}
                {a.status === "approved" && (
                  <Btn primary disabled={!a.canApprove || run.isPending} title={a.canApprove ? undefined : `Needs ${a.perm}`} onClick={() => run.mutate(a.id)}>
                    {run.isPending ? "Running…" : "Run it now"}
                  </Btn>
                )}
                {messageAction && (a.status === "prepared" || a.status === "blocked") && <Btn onClick={() => store.openModal({ type: "edit-action", action: a })}>Edit the message</Btn>}
                {["prepared", "approved", "blocked"].includes(a.status) && (
                  <Btn disabled={cancel.isPending} onClick={() => cancel.mutate(a.id)}>
                    Cancel
                  </Btn>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Memory & Rules ──────────────────────────────────────────────────────

export function MemoryView() {
  const store = useBrainStore();
  const invalidate = useBrainInvalidate();
  const { data, isLoading, error } = useQuery({ queryKey: ["brain-memory"], queryFn: fetchMemory });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = useMutation({ mutationFn: (v: { key: string; value: number }) => setBrainRule(v.key, v.value), onSuccess: () => { store.flash("Rule saved. The next reading uses it."); void invalidate(); }, onError: (e) => store.flash(errorText(e)) });
  const restore = useMutation({ mutationFn: restoreFinding, onSuccess: () => { store.flash("Restored — it will be raised again while it is true."); void invalidate(); }, onError: (e) => store.flash(errorText(e)) });
  if (isLoading) return <Loading />;
  if (error || !data) return <div style={card}><Empty title="Could not read memory and rules" sub={errorText(error)} /></div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: "15px", alignItems: "start" }}>
        <section style={{ ...card, overflow: "hidden" }}>
          <SectionHead title="The rules it reads by" sub="A finding is raised only when a recorded figure crosses one of these. They are also in Settings → AI & Governance." />
          {data.rules.map((r) => {
            const value = draft[r.key] ?? String(r.value ?? "");
            const changed = draft[r.key] !== undefined && draft[r.key] !== String(r.value ?? "");
            return (
              <div key={r.key} style={{ padding: "13px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: "200px" }}>
                  <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{r.label}</span>
                  <span style={{ display: "block", fontSize: "11px", color: "#98A2B3", marginTop: "3px" }}>{r.d}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                  <input type="number" value={value} disabled={!data.canEdit} onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))} aria-label={r.label} style={{ width: "80px", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "9px 10px", fontSize: "12.5px", fontWeight: 700, minHeight: "40px" }} />
                  <span style={{ fontSize: "11.5px", color: "#667085", width: "44px" }}>{r.unit}</span>
                  <Btn primary disabled={!changed || save.isPending || !data.canEdit} onClick={() => save.mutate({ key: r.key, value: Number(value) })}>
                    Save
                  </Btn>
                </span>
              </div>
            );
          })}
          <div style={{ padding: "13px 17px", fontSize: "11.5px", color: "#667085", lineHeight: 1.55 }}>
            Discount limit used for the “above your limit” check: {data.discountLimit === null ? "not set" : `${data.discountLimit}%`} — set in <Link href="/settings/sales">Settings → Sales &amp; POS</Link>.
            {!data.canEdit && " Only people with Business Brain approval rights (Owner and Manager by default) can change these."}
          </div>
        </section>
        <section style={{ ...card, padding: "17px" }}>
          <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>What it will never do</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "13px" }}>
            {[
              "Message a customer, create a purchase order or send an offer without a person approving and then running it. (The only thing it sends by itself is a notification to owners and managers when a watch trips.)",
              "Change a price, a stock count, a credit balance or an order.",
              "Put a number on something it cannot read from your records — expected recovery, time saved and campaign return are left out.",
              "Count a product with no cost price as pure profit.",
              "Forget why you dismissed something — the reason is kept below.",
            ].map((t) => (
              <div key={t} style={{ display: "flex", gap: "10px" }}>
                <span style={{ display: "flex", flex: "0 0 15px", marginTop: "2px" }}>
                  <Icon d="M18 6 6 18M6 6l12 12" size={14} stroke="#B42318" width={2.4} />
                </span>
                <span style={{ fontSize: "12px", color: "#344054", lineHeight: 1.55 }}>{t}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "15px", alignItems: "start" }}>
        <section style={{ ...card, overflow: "hidden" }}>
          <SectionHead title="What you told it to stop raising" sub="Dismissed findings stay hidden until you restore them." />
          {data.dismissed.length === 0 && <Empty title="Nothing dismissed" />}
          {data.dismissed.map((d) => (
            <div key={d.key} style={{ padding: "13px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: "180px" }}>
                <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{d.t}</span>
                <span style={{ display: "block", fontSize: "11px", color: "#667085", marginTop: "3px" }}>
                  {d.reason ? `“${d.reason}”` : "No reason given"} — {d.who ?? "Someone"}, {d.when}
                </span>
              </span>
              <Btn disabled={restore.isPending} onClick={() => restore.mutate(d.key)}>
                Restore
              </Btn>
            </div>
          ))}
        </section>
        <section style={{ ...card, overflow: "hidden" }}>
          <SectionHead title="What you are watching" sub="Findings you marked Watch. Rules with exact conditions are on Opportunity & Risk." />
          {data.watching.length === 0 && <Empty title="Nothing marked as watching" />}
          {data.watching.map((d) => (
            <div key={d.key} style={{ padding: "13px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: "180px" }}>
                <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{d.t}</span>
                <span style={{ display: "block", fontSize: "11px", color: "#667085", marginTop: "3px" }}>
                  {d.who ?? "Someone"}, {d.when}
                </span>
              </span>
              <Btn disabled={restore.isPending} onClick={() => restore.mutate(d.key)}>
                Stop watching
              </Btn>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

// ─── History ─────────────────────────────────────────────────────────────

const STATE_CHIP: Record<string, { bg: string; fg: string }> = {
  "Action needed": { bg: "#FEF3F2", fg: "#B42318" },
  "Attention needed": { bg: "#FEF6E7", fg: "#B54708" },
  Steady: { bg: "#E8F7EE", fg: "#0E8442" },
};

export function HistoryView() {
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"readings" | "questions">("readings");
  const { data, isLoading, error } = useQuery({ queryKey: ["brain-history"], queryFn: fetchHistory });
  if (isLoading) return <Loading />;
  if (error || !data) return <div style={card}><Empty title="Could not read history" sub={errorText(error)} /></div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div style={{ display: "flex", gap: "6px" }}>
        {(["readings", "questions"] as const).map((k) => {
          const on = tab === k;
          return (
            <button key={k} type="button" onClick={() => setTab(k)} style={{ display: "flex", alignItems: "center", gap: "7px", border: `1px solid ${on ? "#12A150" : "#E6EAF0"}`, background: on ? "#F7FCF9" : "#fff", color: on ? "#0E8442" : "#475467", borderRadius: "20px", padding: "9px 14px", fontSize: "12px", fontWeight: 700, cursor: "pointer", minHeight: "42px" }}>
              {k === "readings" ? "Daily readings" : "Questions asked"}
              <span style={{ fontSize: "10.5px", opacity: 0.7 }}>{k === "readings" ? data.readings.length : data.questions.length}</span>
            </button>
          );
        })}
      </div>
      {tab === "readings" && (
        <section style={{ ...card, overflow: "hidden" }}>
          <SectionHead title="What Business Brain said, day by day" sub="One reading is kept per day for this business — when you open the Command Center, and hourly in the background." />
          {data.readings.length === 0 && <Empty title="No readings kept yet" sub="The first one is saved the next time the Command Center is opened or the hourly check runs." />}
          {data.readings.map((r) => {
            const chip = STATE_CHIP[r.label] ?? STATE_CHIP.Steady;
            const isOpen = open === r.id;
            return (
              <div key={r.id} style={{ borderBottom: "1px solid #F2F4F7" }}>
                <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} className="bb-row" style={{ display: "flex", alignItems: "flex-start", gap: "13px", width: "100%", textAlign: "left", border: 0, background: isOpen ? "#FAFBFC" : "#fff", padding: "13px 17px", cursor: "pointer" }}>
                  <span style={{ width: "74px", flex: "0 0 74px", fontSize: "11.5px", fontWeight: 800, color: "#344054", paddingTop: "2px" }}>{r.day}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: chip.fg, background: chip.bg, borderRadius: "5px", padding: "3px 7px" }}>{r.label}</span>
                      <span style={{ fontSize: "11px", color: "#98A2B3" }}>
                        {r.counts.critical ?? 0} critical · {r.counts.attention ?? 0} attention · {r.counts.opportunity ?? 0} opportunities
                      </span>
                    </span>
                    <span style={{ display: "block", fontSize: "12px", color: "#475467", marginTop: "6px", lineHeight: 1.55 }}>{r.summary}</span>
                  </span>
                  <span style={{ display: "flex", transform: `rotate(${isOpen ? 180 : 0}deg)`, marginTop: "3px" }}>
                    <Icon d="m6 9 6 6 6-6" size={14} stroke="#98A2B3" width={2.2} />
                  </span>
                </button>
                {isOpen && (
                  <div style={{ padding: "0 17px 15px 104px", display: "flex", flexDirection: "column", gap: "7px" }}>
                    {r.findings.map((f, i) => (
                      <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12px", color: "#344054" }}>
                        <span style={{ fontSize: "9.5px", fontWeight: 800, textTransform: "uppercase", color: (PRIO[f.kind] ?? PRIO.Resolved).fg, background: (PRIO[f.kind] ?? PRIO.Resolved).bg, borderRadius: "5px", padding: "2px 6px" }}>{f.kind}</span>
                        {f.t}
                        {f.isNew && <span style={{ fontSize: "10px", fontWeight: 800, color: "#3538CD" }}>New that day</span>}
                      </div>
                    ))}
                    {r.cleared.map((t) => (
                      <div key={t} style={{ fontSize: "12px", color: "#0E8442" }}>✓ No longer raised: {t}</div>
                    ))}
                    {r.findings.length === 0 && r.cleared.length === 0 && <div style={{ fontSize: "12px", color: "#98A2B3" }}>Nothing was raised that day.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
      {tab === "questions" && (
        <section style={{ ...card, overflow: "hidden" }}>
          <SectionHead title="Questions asked" sub="Every Ask and Ask why, with the answer given and where it came from." />
          {data.questions.length === 0 && <Empty title="No questions asked yet" />}
          {data.questions.map((q) => (
            <div key={q.id} style={{ padding: "13px 17px", borderBottom: "1px solid #F2F4F7" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{q.q}</span>
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#475467", background: "#F2F4F7", borderRadius: "5px", padding: "2px 7px" }}>{q.source}</span>
                <span style={{ marginLeft: "auto", fontSize: "10.5px", color: "#98A2B3" }}>{q.when}</span>
              </div>
              <div style={{ fontSize: "12px", color: "#475467", marginTop: "6px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{q.a}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ─── Governance ──────────────────────────────────────────────────────────

const LEVEL: Record<string, { dot: string; fg: string }> = {
  ok: { dot: "#12A150", fg: "#0E8442" },
  stale: { dot: "#F79009", fg: "#B54708" },
  old: { dot: "#F79009", fg: "#B54708" },
  warn: { dot: "#F79009", fg: "#B54708" },
  bad: { dot: "#F04438", fg: "#B42318" },
  none: { dot: "#98A2B3", fg: "#475467" },
};

export function GovernanceView() {
  const router = useRouter();
  const scope = useBrainScope();
  const { data, isLoading, error } = useQuery({ queryKey: ["brain-governance", scope], queryFn: () => fetchGovernance(scope) });
  if (isLoading) return <Loading />;
  if (error || !data) return <div style={card}><Empty title="Could not read governance" sub={errorText(error)} /></div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "15px", alignItems: "start" }}>
        <section style={{ ...card, overflow: "hidden" }}>
          <SectionHead title="Data trust centre" sub="Where every reading comes from, and how fresh it is." />
          {data.sources.map((s) => {
            const l = LEVEL[s.level] ?? LEVEL.none;
            return (
              <div key={s.n} style={{ padding: "12px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", gap: "11px", alignItems: "flex-start" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: l.dot, marginTop: "5px", flex: "0 0 auto" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{s.n}</span>
                  <span style={{ display: "block", fontSize: "11px", color: "#98A2B3", marginTop: "3px" }}>{s.why}</span>
                </span>
                <span style={{ fontSize: "11px", fontWeight: 800, color: l.fg, flex: "0 0 auto" }}>{s.st}</span>
              </div>
            );
          })}
        </section>
        <section style={{ ...card, overflow: "hidden" }}>
          <SectionHead title="Gaps that limit the readings" sub="Fixing these makes the figures more trustworthy." />
          {data.gaps.map((g) => {
            const l = LEVEL[g.level] ?? LEVEL.none;
            return (
              <div key={g.t} style={{ padding: "13px 17px", borderBottom: "1px solid #F2F4F7" }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: l.dot, flex: "0 0 auto" }} />
                  <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{g.t}</span>
                  {g.link && (
                    <Btn onClick={() => router.push(g.link!.href)} style={{ minHeight: "34px", padding: "7px 11px" }}>
                      {g.link.label}
                    </Btn>
                  )}
                </div>
                <div style={{ fontSize: "11px", color: "#667085", marginTop: "5px", marginLeft: "18px", lineHeight: 1.5 }}>
                  {g.d}
                  {g.items.length > 0 && ` ${g.items.join(", ")}.`}
                </div>
              </div>
            );
          })}
        </section>
      </div>
      <section style={{ ...card, overflow: "hidden" }}>
        <SectionHead title="Who can approve what" sub="Read from your roles, including custom roles. Owners can always approve." />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "640px" }}>
            <thead>
              <tr style={{ background: "#FAFBFC" }}>
                {["Action", "Who can approve and run it", "Waiting", "Done", "Failed"].map((h, i) => (
                  <th key={h} style={{ textAlign: i >= 2 ? "right" : "left", fontSize: "11px", fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.approvals.map((a) => (
                <tr key={a.type} style={{ borderTop: "1px solid #F2F4F7" }}>
                  <td style={{ padding: "12px 17px", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{a.label}</td>
                  <td style={{ padding: "12px 17px", fontSize: "12px", color: "#475467" }}>{a.who}</td>
                  <td style={{ padding: "12px 17px", fontSize: "12.5px", textAlign: "right" }}>{a.prepared}</td>
                  <td style={{ padding: "12px 17px", fontSize: "12.5px", textAlign: "right", color: "#0E8442", fontWeight: 700 }}>{a.done}</td>
                  <td style={{ padding: "12px 17px", fontSize: "12.5px", textAlign: "right", color: a.failed ? "#B42318" : "#98A2B3", fontWeight: 700 }}>{a.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section style={{ ...card, overflow: "hidden" }}>
        <SectionHead title="Where AI is and is not used" sub="Switch AI features off in Settings → AI & Governance." />
        {data.ai.map((a) => (
          <div key={a.t} style={{ padding: "13px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: a.ai ? "#3538CD" : "#0E8442", background: a.ai ? "#EEF4FF" : "#E8F7EE", borderRadius: "5px", padding: "3px 7px", flex: "0 0 auto", marginTop: "1px" }}>{a.ai ? "Uses AI" : "No AI"}</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{a.t}</span>
              <span style={{ display: "block", fontSize: "11px", color: "#667085", marginTop: "3px", lineHeight: 1.5 }}>{a.d}</span>
            </span>
          </div>
        ))}
      </section>
      <div style={{ fontSize: "11px", color: "#98A2B3" }}>
        Confidence levels: <span style={{ color: CONF.High.fg, fontWeight: 700 }}>High</span> means every figure is a recorded total; <span style={{ color: CONF.Medium.fg, fontWeight: 700 }}>Medium</span> means part of it rests on an average or has gaps; <span style={{ color: CONF.Low.fg, fontWeight: 700 }}>Low</span> means large gaps.
      </div>
    </div>
  );
}
