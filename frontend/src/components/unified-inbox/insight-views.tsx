"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { assignConversation, fetchAttention, fetchInboxAnalytics, fetchInboxChannels, fetchInboxOverview, snoozeConversation } from "@/lib/inbox-api";
import { useInboxStore } from "./inbox-store";
import { EmptyBlock, Loading, card, errorText, useInboxInvalidate } from "./inbox-ui";
import { KPI_TONE } from "./team-view";

function statusColors(st: string) {
  if (st === "Connected") return { bg: "#E8F7EE", fg: "#0E8442", bd: "#E6EAF0" };
  if (st === "Sending only") return { bg: "#EEF4FF", fg: "#3538CD", bd: "#E6EAF0" };
  if (st === "Reconnect needed") return { bg: "#FEF3F2", fg: "#B42318", bd: "#FDD9D6" };
  if (st === "Not configured") return { bg: "#FEF6E7", fg: "#B54708", bd: "#E6EAF0" };
  return { bg: "#F2F4F7", fg: "#475467", bd: "#E6EAF0" };
}

export function ChannelsView() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ["inbox-channels"], queryFn: fetchInboxChannels });
  if (isLoading || !data) return <Loading />;
  const broken = data.cards.filter((c) => c.st === "Reconnect needed" || c.st === "Not configured");
  const unavailable = data.cards.filter((c) => c.st === "Not available");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "14px" }}>
        {data.cards.map((c) => {
          const sc = statusColors(c.st);
          const bad = c.st === "Reconnect needed";
          return (
            <div key={c.key} style={{ background: "#fff", border: `1px solid ${sc.bd}`, borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "11px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
                {c.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/inbox-icons/${c.icon}.png`} alt="" style={{ width: "36px", height: "36px", borderRadius: "9px", objectFit: "contain", flex: "0 0 36px" }} />
                ) : (
                  <span style={{ width: "36px", height: "36px", borderRadius: "11px", background: "#F2F4F7", color: "#101828", fontSize: "12px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{c.init}</span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "13px", fontWeight: 800, color: "#101828" }}>{c.n}</span>
                  <span style={{ display: "block", fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>{c.handle}</span>
                </span>
                <span style={{ fontSize: "10px", fontWeight: 800, color: sc.fg, background: sc.bg, borderRadius: "20px", padding: "4px 10px", flex: "0 0 auto" }}>{c.st}</span>
              </div>
              <div style={{ fontSize: "11.5px", color: "#475467", lineHeight: 1.5, flex: 1 }}>{c.note}</div>
              <div style={{ display: "flex", gap: "14px", borderTop: "1px solid #F2F4F7", paddingTop: "10px" }}>
                <span>
                  <span style={{ display: "block", fontSize: "15px", fontWeight: 800, color: "#0F172A" }}>{c.vol}</span>
                  <span style={{ display: "block", fontSize: "10px", color: "#98A2B3", marginTop: "1px" }}>messages in, 7 days</span>
                </span>
                <span>
                  <span style={{ display: "block", fontSize: "15px", fontWeight: 800, color: c.resp === "—" ? "#98A2B3" : c.respLate ? "#B54708" : "#0F172A" }}>{c.resp}</span>
                  <span style={{ display: "block", fontSize: "10px", color: "#98A2B3", marginTop: "1px" }}>median first reply</span>
                </span>
              </div>
              {c.cta && c.href ? (
                <button
                  type="button"
                  onClick={() => router.push(c.href!)}
                  style={{ border: `1px solid ${bad ? "#B42318" : "#E6EAF0"}`, background: bad ? "#B42318" : "#fff", borderRadius: "10px", padding: "10px 13px", fontSize: "12px", fontWeight: 800, color: bad ? "#fff" : "#344054", cursor: "pointer", minHeight: "42px", width: "100%" }}
                >
                  {c.cta}
                </button>
              ) : (
                <div style={{ border: "1px dashed #E6EAF0", borderRadius: "10px", padding: "10px 13px", fontSize: "11.5px", fontWeight: 700, color: "#98A2B3", minHeight: "42px", textAlign: "center" }}>
                  {c.st === "Not available" ? "Nothing to connect" : "Set up by the Noxtill platform"}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ ...card, padding: "17px", fontSize: "11.5px", color: "#667085", lineHeight: 1.6 }}>
        {broken.length
          ? `${broken.map((b) => b.n).join(" and ")} ${broken.length === 1 ? "is" : "are"} not delivering right now and say${broken.length === 1 ? "s" : ""} so plainly rather than showing zero and looking healthy. `
          : "Every channel that can be connected is either working or honestly marked as not connected. "}
        {unavailable.length ? `${unavailable.map((u) => u.n).join(", ")} have no connection in Noxtill at all, so nothing from them can ever appear in this inbox.` : ""}
      </div>
    </div>
  );
}

export function AnalyticsView() {
  const { data, isLoading } = useQuery({ queryKey: ["inbox-analytics"], queryFn: fetchInboxAnalytics });
  if (isLoading || !data) return <Loading />;
  const levelColor = { good: "#12A150", warn: "#F79009", bad: "#B54708" } as const;
  const hourColor = ["#D5EFE0", "#D5EFE0", "#7CD4A6", "#12A150"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "14px" }}>
        {data.kpis.map((k) => (
          <div key={k.l} style={{ background: "#fff", border: `1px solid ${KPI_TONE[k.tone].bd}`, borderRadius: "14px", padding: "15px" }}>
            <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>{k.l}</div>
            <div style={{ fontSize: "25px", fontWeight: 800, color: KPI_TONE[k.tone].color, marginTop: "7px", lineHeight: 1.1 }}>{k.v}</div>
            <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "4px" }}>{k.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: "14px" }}>
        <div style={{ ...card, padding: "17px" }}>
          <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>First reply time by channel</div>
          <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>{data.targetText}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "15px" }}>
            {data.channels.length === 0 && <div style={{ fontSize: "12px", color: "#98A2B3" }}>No first replies in the last 30 days.</div>}
            {data.channels.map((c) => (
              <div key={c.n}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginBottom: "5px" }}>
                  <span style={{ color: "#344054", fontWeight: 600 }}>{c.n}</span>
                  <span style={{ fontWeight: 800, color: levelColor[c.level] }}>{c.v}</span>
                </div>
                <div style={{ height: "8px", borderRadius: "6px", background: "#F2F4F7", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: c.w, background: levelColor[c.level], borderRadius: "6px" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...card, padding: "17px" }}>
          <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>When messages arrive</div>
          <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>Average per hour, last 30 days. Staffing follows this, not a guess.</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "5px", height: "150px", marginTop: "16px" }}>
            {data.hours.map((h) => (
              <div key={h.l} title={`${h.v} per day on average`} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                <div style={{ width: "100%", height: h.h, background: hourColor[h.level], borderRadius: "5px 5px 0 0", minHeight: "4px" }} />
                <span style={{ fontSize: "9px", color: "#98A2B3" }}>{h.l}</span>
              </div>
            ))}
          </div>
          {data.hoursNote && <div style={{ fontSize: "10.5px", color: "#98A2B3", marginTop: "8px" }}>{data.hoursNote}</div>}
        </div>
      </div>
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7" }}>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#101828" }}>What conversations were about</div>
          <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>Tagged by rules and people, not by AI guessing. Untagged is shown honestly. {data.topicsTotal} conversations, last 30 days.</div>
        </div>
        {data.topics.length === 0 && <EmptyBlock title="No conversations in the last 30 days" />}
        {data.topics.map((t) => (
          <div key={t.n} style={{ padding: "13px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "center", gap: "13px" }}>
            <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 600, color: "#101828" }}>{t.n}</span>
            <span style={{ width: "150px", height: "8px", borderRadius: "6px", background: "#F2F4F7", overflow: "hidden", flex: "0 0 auto" }}>
              <span style={{ display: "block", height: "100%", width: t.w, background: t.untagged ? "#98A2B3" : t.n.toLowerCase() === "money" ? "#F79009" : "#12A150", borderRadius: "6px" }} />
            </span>
            <span style={{ fontSize: "12px", fontWeight: 800, color: "#0F172A", width: "52px", textAlign: "right", flex: "0 0 auto" }}>{t.v}</span>
          </div>
        ))}
        <div style={{ padding: "14px 17px", fontSize: "11.5px", color: "#98A2B3" }}>Resolution rate is not shown because closing a conversation is not the same as solving the problem, and the system cannot tell the difference.</div>
      </div>
    </div>
  );
}

const SLA: Record<string, { bg: string; fg: string }> = {
  Holding: { bg: "#E8F7EE", fg: "#0E8442" },
  Slipping: { bg: "#FEF6E7", fg: "#B54708" },
  Broken: { bg: "#FEF3F2", fg: "#B42318" },
  "No data": { bg: "#F2F4F7", fg: "#475467" },
};

export function AttentionView() {
  const router = useRouter();
  const select = useInboxStore((s) => s.select);
  const openModal = useInboxStore((s) => s.openModal);
  const flash = useInboxStore((s) => s.flash);
  const invalidate = useInboxInvalidate();
  const { data, isLoading } = useQuery({ queryKey: ["inbox-attention"], queryFn: fetchAttention, refetchInterval: 30000 });
  const { data: overview } = useQuery({ queryKey: ["inbox-overview"], queryFn: fetchInboxOverview });
  const take = useMutation({ mutationFn: (id: string) => assignConversation(id, overview!.me.userId), onSuccess: (d) => { flash(`${d.name} is yours now`); void invalidate(); }, onError: (e) => flash(errorText(e)) });
  const snooze = useMutation({ mutationFn: (id: string) => snoozeConversation(id, 60), onSuccess: (d) => { flash(`${d.name} snoozed for an hour`); void invalidate(); }, onError: (e) => flash(errorText(e)) });
  if (isLoading || !data) return <Loading />;
  const n = data.items.length;
  const words = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div style={{ background: n ? "#FEF3F2" : "#F7FCF9", border: `1px solid ${n ? "#FDD9D6" : "#D5EFE0"}`, borderRadius: "12px", padding: "13px 15px" }}>
        <div style={{ fontSize: "13px", fontWeight: 800, color: n ? "#912018" : "#0E8442" }}>
          {n ? `${words[n] ?? n} conversation${n === 1 ? " needs" : "s need"} a person, not a reply` : "Nothing needs a person right now"}
        </div>
        <div style={{ fontSize: "11.5px", color: n ? "#B42318" : "#0E8442", marginTop: "4px", lineHeight: 1.5 }}>These are sorted by what is at stake, not by how long they have waited.</div>
      </div>
      {data.items.map((a) => {
        const unowned = !a.assigneeUserId;
        const red = a.red;
        return (
          <div key={a.id} style={{ background: "#fff", border: `1px solid ${red ? "#FDD9D6" : "#FDE3B3"}`, borderRadius: "16px", padding: "17px", display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-start" }}>
            <span style={{ width: "38px", height: "38px", borderRadius: "12px", background: red ? "#FEF3F2" : "#FEF6E7", color: red ? "#B42318" : "#B54708", fontSize: "12px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{a.init}</span>
            <div style={{ flex: 1, minWidth: "220px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>{a.name}</span>
                <span style={{ fontSize: "9.5px", fontWeight: 800, color: a.tag === "Money" ? "#B54708" : "#B42318", background: a.tag === "Money" ? "#FEF6E7" : "#FEF3F2", borderRadius: "5px", padding: "2px 7px" }}>{a.tag}</span>
                <span style={{ fontSize: "10.5px", color: "#98A2B3" }}>{a.age}</span>
              </div>
              <div style={{ fontSize: "12.5px", color: "#344054", marginTop: "7px", lineHeight: 1.55 }}>&ldquo;{a.what}&rdquo;</div>
              <div style={{ fontSize: "11.5px", color: "#667085", marginTop: "6px", lineHeight: 1.55 }}>Why it is here: {a.why}</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => {
                    if (unowned && overview) take.mutate(a.id);
                    else {
                      select(a.id);
                      router.push("/unified-inbox/conversation");
                    }
                  }}
                  className="nx-primary"
                  style={{ border: 0, background: "#12A150", borderRadius: "10px", padding: "9px 15px", fontSize: "11.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "40px" }}
                >
                  {unowned ? "Take this conversation" : "Open the conversation"}
                </button>
                <button type="button" onClick={() => openModal({ type: "assign", conversationId: a.id })} className="nx-hover-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 15px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "40px" }}>
                  Give to someone
                </button>
                <button type="button" onClick={() => snooze.mutate(a.id)} className="nx-hover-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 15px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "40px" }}>
                  Snooze an hour
                </button>
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "#101828" }}>Promise times</div>
            <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>What you have told customers to expect, and whether it is holding. Actuals are medians over the last 30 days.</div>
          </div>
          {overview?.canManage && (
            <button type="button" onClick={() => openModal({ type: "targets-editor" })} style={{ border: 0, background: "none", fontSize: "11.5px", fontWeight: 800, color: "#0E8442", cursor: "pointer" }}>
              Change targets
            </button>
          )}
        </div>
        {data.sla.map((s) => (
          <div key={s.n} style={{ padding: "13px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "center", gap: "13px", flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: "170px", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{s.n}</span>
            <span style={{ fontSize: "11.5px", color: "#667085", width: "110px" }}>Target {s.target}</span>
            <span style={{ fontSize: "11.5px", color: "#667085", width: "130px" }}>Actual {s.actual}</span>
            <span style={{ fontSize: "10.5px", fontWeight: 800, color: SLA[s.st].fg, background: SLA[s.st].bg, borderRadius: "20px", padding: "4px 10px" }}>{s.st}</span>
          </div>
        ))}
        <div style={{ padding: "14px 17px", fontSize: "11.5px", color: "#98A2B3" }}>{data.clockNote}</div>
      </div>
    </div>
  );
}
