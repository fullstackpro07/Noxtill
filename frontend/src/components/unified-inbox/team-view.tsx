"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { assignConversation, fetchInboxOverview, fetchTeam, type Tone } from "@/lib/inbox-api";
import { useInboxStore } from "./inbox-store";
import { Avatar, EmptyBlock, Loading, card, errorText, useInboxInvalidate } from "./inbox-ui";

export const KPI_TONE: Record<Tone, { bd: string; color: string }> = {
  red: { bd: "#FDD9D6", color: "#B42318" },
  amber: { bd: "#FDE3B3", color: "#B54708" },
  green: { bd: "#D5EFE0", color: "#0E8442" },
  blue: { bd: "#C7D7FE", color: "#3538CD" },
  neutral: { bd: "#E6EAF0", color: "#0F172A" },
};

const label: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: "5px" };
const field: React.CSSProperties = { width: "100%", border: "1px solid #E6EAF0", borderRadius: "11px", padding: "12px", fontSize: "12.5px", fontWeight: 700, color: "#344054", background: "#fff", minHeight: "48px" };

export function TeamView() {
  const { data, isLoading } = useQuery({ queryKey: ["inbox-team"], queryFn: fetchTeam, refetchInterval: 30000 });
  const { data: overview } = useQuery({ queryKey: ["inbox-overview"], queryFn: fetchInboxOverview });
  const openModal = useInboxStore((s) => s.openModal);
  const selectedId = useInboxStore((s) => s.selectedId);
  const flash = useInboxStore((s) => s.flash);
  const invalidate = useInboxInvalidate();
  const [team, setTeam] = useState("All teams");
  const [person, setPerson] = useState("");
  const [why, setWhy] = useState("");
  const [convId, setConvId] = useState("");

  const people = useMemo(() => (data?.people ?? []).filter((p) => team === "All teams" || p.roleLabel === team).sort((a, b) => a.open - b.open), [data, team]);
  const lightest = people[0];
  const chosenConv = convId || (data?.conversations.some((c) => c.id === selectedId) ? selectedId! : (data?.conversations[0]?.id ?? ""));
  const chosenPerson = person || lightest?.userId || "";

  const reassign = useMutation({
    mutationFn: () => assignConversation(chosenConv, chosenPerson, why.trim() || undefined),
    onSuccess: (d) => {
      flash(`${d.name} is now with ${d.owner}`);
      setWhy("");
      void invalidate();
    },
    onError: (e) => flash(errorText(e)),
  });

  if (isLoading || !data) return <Loading />;
  const canManage = overview?.canManage ?? false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "14px" }}>
        {data.kpis.map((k) => (
          <div key={k.l} style={{ background: "#fff", border: `1px solid ${KPI_TONE[k.tone].bd}`, borderRadius: "14px", padding: "15px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#475467" }}>{k.l}</div>
            <div style={{ fontSize: "21px", fontWeight: 800, color: KPI_TONE[k.tone].color, marginTop: "6px" }}>{k.v}</div>
            <div style={{ fontSize: "10.5px", color: "#98A2B3", marginTop: "4px" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", border: `1.5px solid ${data.unassigned.length ? "#FDD9D6" : "#E6EAF0"}`, borderRadius: "16px", overflow: "hidden" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: data.unassigned.length ? "#912018" : "#101828" }}>Nobody owns these yet</h3>
        </div>
        {data.unassigned.length === 0 && <EmptyBlock title="Every open conversation has an owner" />}
        {data.unassigned.map((u) => (
          <div key={u.id} style={{ padding: "13px 17px", borderTop: "1px solid #F2F4F7", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: "200px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{u.n}</span>
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#475467", background: "#F2F4F7", borderRadius: "5px", padding: "2px 7px" }}>{u.ch}</span>
                {u.age !== "—" && <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#B42318" }}>{u.age} waiting</span>}
              </span>
              <span style={{ display: "block", fontSize: "11.5px", color: "#475467", marginTop: "5px" }}>{u.why}</span>
              {u.sug && <span style={{ display: "block", fontSize: "11px", color: "#0E8442", marginTop: "4px" }}>Suggested: {u.sug.text}</span>}
            </span>
            <button
              type="button"
              onClick={() => openModal({ type: "assign", conversationId: u.id, suggestedUserId: u.sug?.userId })}
              className="nx-primary"
              style={{ border: 0, background: "#12A150", borderRadius: "10px", padding: "10px 16px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px" }}
            >
              Assign
            </button>
          </div>
        ))}
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Who is carrying what</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "800px" }}>
            <thead>
              <tr style={{ background: "#FAFBFC" }}>
                {["Person", "Open", "Waiting", "Past promise", "Replies in", "Load"].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 0 || i === 5 ? "left" : "right", fontSize: "11px", fontWeight: 700, color: "#98A2B3", padding: i === 0 || i === 5 ? "10px 17px" : "10px", minWidth: i === 5 ? "150px" : undefined }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((t) => {
                const loadColor = t.load > 60 ? "#F04438" : t.load > 45 ? "#F79009" : "#12A150";
                return (
                  <tr key={t.userId} style={{ borderTop: "1px solid #F2F4F7" }}>
                    <td style={{ padding: "12px 17px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Avatar init={t.init} />
                        <span>
                          <span style={{ display: "block", fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{t.n}</span>
                          <span style={{ display: "block", fontSize: "10.5px", color: "#98A2B3", marginTop: "2px" }}>{t.r}</span>
                        </span>
                      </span>
                    </td>
                    <td style={{ padding: "12px", fontSize: "12.5px", fontWeight: 800, color: "#101828", textAlign: "right" }}>{t.open}</td>
                    <td style={{ padding: "12px", fontSize: "12.5px", color: "#475467", textAlign: "right" }}>{t.waiting}</td>
                    <td style={{ padding: "12px", fontSize: "12.5px", fontWeight: 800, color: t.over > 1 ? "#B42318" : t.over > 0 ? "#B54708" : "#98A2B3", textAlign: "right" }}>{t.over}</td>
                    <td style={{ padding: "12px", fontSize: "12.5px", fontWeight: 700, color: t.resp === "—" ? "#98A2B3" : t.respLate ? "#B54708" : "#0E8442", textAlign: "right" }}>{t.resp}</td>
                    <td style={{ padding: "12px 17px" }}>
                      <span style={{ display: "block", height: "8px", borderRadius: "5px", background: "#F2F4F7", overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", borderRadius: "5px", background: loadColor, width: `${t.load}%` }} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: "11.5px", color: "#98A2B3" }}>
          Workload is open conversations against what that person usually handles in a day (conversations they replied in, per working day, over 30 days). It is a rough guide for who to hand the next one to, not a performance score.
        </div>
      </div>

      <div style={{ ...card, padding: "17px" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 800, color: "#101828" }}>Hand a conversation over</h3>
        <p style={{ margin: "0 0 13px", fontSize: "11.5px", color: "#98A2B3" }}>Reassigning changes who is responsible, so the previous owner is told and it is recorded.</p>
        {!canManage && <p style={{ margin: "0 0 13px", fontSize: "11.5px", color: "#B54708", fontWeight: 700 }}>Only an Owner or Manager can hand conversations between people. You can take unassigned ones yourself.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "11px" }}>
          <div>
            <label style={label}>Conversation</label>
            <select aria-label="Conversation" value={chosenConv} onChange={(e) => setConvId(e.target.value)} style={field}>
              {data.conversations.length === 0 && <option value="">No open conversations</option>}
              {data.conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.channel}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>Team</label>
            <select aria-label="Team" value={team} onChange={(e) => { setTeam(e.target.value); setPerson(""); }} style={field}>
              <option>All teams</option>
              {data.teams.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>Person</label>
            <select aria-label="Person" value={chosenPerson} onChange={(e) => setPerson(e.target.value)} style={field}>
              {people.map((p, i) => (
                <option key={p.userId} value={p.userId}>
                  {p.name}
                  {i === 0 ? ` — lightest${team === "All teams" ? "" : ` in ${team}`}` : ""} ({p.open} open)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>Why</label>
            <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Optional — shown to the new owner" aria-label="Reason" style={{ ...field, fontWeight: 400, fontSize: "13px" }} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "13px" }}>
          <button
            type="button"
            onClick={() => reassign.mutate()}
            disabled={!chosenConv || !chosenPerson || reassign.isPending || !canManage}
            className="nx-primary"
            style={{ border: 0, background: "#12A150", borderRadius: "11px", padding: "11px 20px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px", opacity: !chosenConv || !canManage ? 0.55 : 1 }}
          >
            {reassign.isPending ? "Reassigning…" : "Reassign"}
          </button>
        </div>
      </div>
    </div>
  );
}
