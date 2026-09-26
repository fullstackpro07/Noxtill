"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomer360, fetchTimeline } from "@/lib/inbox-api";
import { useInboxStore } from "./inbox-store";
import { useSelectedConversation } from "./conversation-parts";
import { CHIP, EmptyBlock, InfoBanner, Loading, card } from "./inbox-ui";

function NoSelection() {
  return (
    <div style={card}>
      <EmptyBlock title="No conversation selected" sub="Pick a conversation in Overview first — this screen shows the customer behind it." icon="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />
    </div>
  );
}

export function Customer360View() {
  const { id, list } = useSelectedConversation();
  const openModal = useInboxStore((s) => s.openModal);
  const { data, isLoading } = useQuery({ queryKey: ["inbox-c360", id], queryFn: () => fetchCustomer360(id!), enabled: !!id });
  if (!id) return list.isLoading ? <Loading /> : <NoSelection />;
  if (isLoading || !data) return <Loading />;
  const c = data.customer;
  if (!c) {
    return (
      <div style={{ ...card, padding: "17px", display: "flex", alignItems: "flex-start", gap: "14px", flexWrap: "wrap" }}>
        <span style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#0A1B2A", color: "#fff", fontSize: "17px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 52px" }}>{data.init}</span>
        <span style={{ flex: 1, minWidth: "200px" }}>
          <span style={{ display: "block", fontSize: "18px", fontWeight: 800, color: "#0F172A" }}>{data.name}</span>
          <span style={{ display: "block", fontSize: "12px", color: "#98A2B3", marginTop: "4px" }}>
            {data.status} · {data.since}
          </span>
          <span style={{ display: "block", fontSize: "11.5px", color: "#667085", marginTop: "9px" }}>
            {data.channel}: {data.handle}
          </span>
          <span style={{ display: "block", fontSize: "12px", color: "#475467", marginTop: "12px", lineHeight: 1.6, maxWidth: "60ch" }}>
            This contact is not linked to a customer record, so there are no orders, bookings, credit or reviews to show. Nothing is created until someone decides to.
          </span>
        </span>
        <button
          type="button"
          onClick={() => openModal({ type: "create-customer", conversationId: id })}
          className="nx-primary"
          style={{ border: 0, background: "#12A150", borderRadius: "11px", padding: "11px 18px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px" }}
        >
          Create a customer record
        </button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div style={{ ...card, padding: "17px", display: "flex", alignItems: "flex-start", gap: "14px", flexWrap: "wrap" }}>
        <span style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#0A1B2A", color: "#fff", fontSize: "17px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 52px" }}>{c.init}</span>
        <span style={{ flex: 1, minWidth: "200px" }}>
          <span style={{ display: "block", fontSize: "18px", fontWeight: 800, color: "#0F172A" }}>{c.name}</span>
          <span style={{ display: "block", fontSize: "12px", color: "#98A2B3", marginTop: "4px" }}>
            {c.status} · {c.since}
          </span>
          <span style={{ display: "flex", gap: "16px", marginTop: "9px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11.5px", color: "#667085" }}>{c.phone}</span>
            <span style={{ fontSize: "11.5px", color: "#667085" }}>{c.email}</span>
            <span style={{ fontSize: "11.5px", color: "#667085" }}>{c.loc}</span>
          </span>
        </span>
        <span style={{ display: "flex", gap: "7px", flexWrap: "wrap", alignItems: "center" }}>
          {c.tags.map((t) => (
            <span key={t} style={{ fontSize: "10.5px", fontWeight: 700, color: "#0E8442", background: "#E8F7EE", borderRadius: "20px", padding: "4px 11px" }}>
              {t}
            </span>
          ))}
          <Link href={`/customers/${c.id}`} style={{ fontSize: "11.5px", fontWeight: 800, color: "#0E8442", textDecoration: "none", marginLeft: "6px" }}>
            Open in Customers
          </Link>
        </span>
      </div>

      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "14px" }}>
        {c.stats.map((s) => (
          <div key={s.l} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "14px", padding: "15px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#475467" }}>{s.l}</div>
            <div style={{ fontSize: "21px", fontWeight: 800, color: "#0F172A", marginTop: "6px" }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div data-3pane="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "15px" }}>
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#101828" }}>Recent orders</h3>
          </div>
          {c.orders.length === 0 && <div style={{ padding: "18px 17px", fontSize: "12px", color: "#98A2B3" }}>No orders yet.</div>}
          {c.orders.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => openModal({ type: "order", orderId: o.id })}
              className="nx-row"
              style={{ width: "100%", textAlign: "left", border: 0, background: "#fff", padding: "12px 17px", borderTop: "1px solid #F2F4F7", display: "flex", alignItems: "center", gap: "11px", flexWrap: "wrap", cursor: "pointer" }}
            >
              <span style={{ flex: 1, minWidth: "120px" }}>
                <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#0E8442" }}>{o.no}</span>
                <span style={{ display: "block", fontSize: "10.5px", color: "#98A2B3", marginTop: "2px" }}>{o.d}</span>
              </span>
              <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{o.v}</span>
              <span style={{ fontSize: "10px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", background: CHIP[o.tone].bg, color: CHIP[o.tone].fg, whiteSpace: "nowrap" }}>{o.s}</span>
            </button>
          ))}
        </div>
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#101828" }}>Bookings</h3>
          </div>
          {c.bookings.length === 0 && <div style={{ padding: "18px 17px", fontSize: "12px", color: "#98A2B3" }}>No bookings.</div>}
          {c.bookings.map((b) => (
            <div key={b.id} style={{ padding: "12px 17px", borderTop: "1px solid #F2F4F7", display: "flex", alignItems: "center", gap: "11px", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: "140px" }}>
                <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{b.t}</span>
                <span style={{ display: "block", fontSize: "10.5px", color: "#98A2B3", marginTop: "2px" }}>{b.d}</span>
              </span>
              <span style={{ fontSize: "10px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", background: CHIP[b.tone].bg, color: CHIP[b.tone].fg, whiteSpace: "nowrap" }}>{b.s}</span>
            </div>
          ))}
        </div>
      </div>

      <div data-3pane="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "15px" }}>
        <div style={{ ...card, padding: "17px" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 800, color: "#101828" }}>Credit</h3>
          <KV l="Outstanding" v={c.credit.out} strong />
          <KV l="Overdue (30+ days)" v={c.credit.over} strong />
          <KV l="Last payment" v={c.credit.last} last />
          <Link href={`/credit/${c.id}`} style={{ display: "inline-block", marginTop: "10px", fontSize: "11.5px", fontWeight: 800, color: "#0E8442", textDecoration: "none" }}>
            Open the credit record
          </Link>
        </div>
        <div style={{ ...card, padding: "17px" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 800, color: "#101828" }}>Latest review</h3>
          {c.review ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                <span style={{ fontSize: "22px", fontWeight: 800, color: "#0F172A" }}>{c.review.rating}</span>
                <span style={{ fontSize: "11px", color: "#98A2B3" }}>{c.review.when}</span>
              </div>
              <div style={{ fontSize: "12.5px", color: "#344054", marginTop: "9px", lineHeight: 1.6 }}>{c.review.text}</div>
            </>
          ) : (
            <div style={{ fontSize: "12.5px", color: "#98A2B3", lineHeight: 1.6 }}>This customer has not left a review through a Noxtill review request.</div>
          )}
        </div>
      </div>

      <div style={{ ...card, padding: "17px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 800, color: "#101828" }}>Team notes</h3>
            <p style={{ margin: "0 0 12px", fontSize: "11.5px", color: "#98A2B3" }}>Never visible to the customer.</p>
          </div>
          <button type="button" onClick={() => openModal({ type: "add-note", conversationId: id, kind: "customer" })} style={{ border: 0, background: "none", fontSize: "11.5px", fontWeight: 800, color: "#0E8442", cursor: "pointer" }}>
            Add note
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {c.notes.length === 0 && <div style={{ fontSize: "12px", color: "#98A2B3" }}>No notes yet.</div>}
          {c.notes.map((n) => (
            <div key={n.id} style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "11px", padding: "12px" }}>
              <div style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.6 }}>{n.t}</div>
              <div style={{ fontSize: "10.5px", color: "#93370D", marginTop: "6px" }}>
                {n.who} · {n.when}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KV({ l, v, strong, last }: { l: string; v: string; strong?: boolean; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "8px 0", borderBottom: last ? 0 : "1px solid #F2F4F7" }}>
      <span style={{ fontSize: "12.5px", color: "#667085" }}>{l}</span>
      <span style={{ fontSize: "12.5px", fontWeight: strong ? 800 : 700, color: strong ? "#0E8442" : "#344054", textAlign: "right" }}>{v}</span>
    </div>
  );
}

const TL_FILTERS = ["Everything", "Messages", "Orders", "Payments", "Bookings", "Reviews"];
const KIND: Record<string, { bg: string; fg: string }> = {
  Messages: { bg: "#EEF4FF", fg: "#3538CD" },
  Orders: { bg: "#E8F7EE", fg: "#0E8442" },
  Payments: { bg: "#FEF6E7", fg: "#B54708" },
  Bookings: { bg: "#F5EBFE", fg: "#7E22CE" },
  Reviews: { bg: "#FEF3F2", fg: "#B42318" },
};

export function TimelineView() {
  const { id, list } = useSelectedConversation();
  const openModal = useInboxStore((s) => s.openModal);
  const router = useRouter();
  const [filter, setFilter] = useState("Everything");
  const { data, isLoading } = useQuery({ queryKey: ["inbox-timeline", id, filter], queryFn: () => fetchTimeline(id!, filter), enabled: !!id });
  if (!id) return list.isLoading ? <Loading /> : <NoSelection />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <InfoBanner>Every line here is a record from another part of Noxtill. Nothing on this timeline was written by hand, and nothing is inferred — if an event is not in the system, it does not appear.</InfoBanner>
      <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
        {TL_FILTERS.map((k) => {
          const on = filter === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              style={{ border: `1px solid ${on ? "#12A150" : "#E6EAF0"}`, background: on ? "#F7FCF9" : "#fff", color: on ? "#0E8442" : "#475467", borderRadius: "20px", padding: "9px 14px", fontSize: "12px", fontWeight: 700, cursor: "pointer", minHeight: "42px" }}
            >
              {k}
            </button>
          );
        })}
      </div>
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>{data?.name ?? "…"} · everything that has happened</h3>
          {data && !data.linked && <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "4px" }}>Not linked to a customer record, so only this conversation’s messages can be shown.</div>}
        </div>
        {isLoading && <Loading />}
        {data?.events.length === 0 && <EmptyBlock title="Nothing recorded" sub={filter === "Everything" ? "No events for this contact yet." : `No ${filter.toLowerCase()} for this contact.`} />}
        {data?.events.map((e, i) => (
          <div key={i} style={{ padding: "13px 17px", borderTop: "1px solid #F2F4F7", display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <span style={{ width: "74px", flex: "0 0 74px" }}>
              <span style={{ display: "block", fontSize: "11.5px", fontWeight: 800, color: "#344054" }}>{e.d}</span>
              <span style={{ display: "block", fontSize: "10.5px", color: "#98A2B3", marginTop: "2px" }}>{e.t}</span>
            </span>
            <span style={{ flex: 1, minWidth: "200px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "9.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: KIND[e.kind]?.fg, background: KIND[e.kind]?.bg, borderRadius: "5px", padding: "2px 7px" }}>{e.kind}</span>
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{e.title}</span>
              </span>
              <span style={{ display: "block", fontSize: "11.5px", color: "#475467", marginTop: "5px", lineHeight: 1.55 }}>{e.detail}</span>
              <span style={{ display: "block", fontSize: "10.5px", color: "#98A2B3", marginTop: "4px" }}>{e.who}</span>
            </span>
            {e.link && (
              <button
                type="button"
                onClick={() => (e.link!.kind === "order" && e.link!.ref ? openModal({ type: "order", orderId: e.link!.ref }) : e.link!.href && router.push(e.link!.href))}
                className="nx-accent"
                style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: "40px", alignSelf: "center" }}
              >
                {e.link.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
