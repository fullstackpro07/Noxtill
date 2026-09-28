"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchOpportunity, removeWatch, type FindingCard } from "@/lib/brain-api";
import { useBrainScope, useBrainStore } from "./brain-store";
import { useFindingActions } from "./finding-actions";
import { CONF, Empty, Icon, Loading, PRIO, card, errorText, iconFor, useBrainInvalidate } from "./brain-ui";

const TABS = ["Opportunities", "Risks", "Watchlist", "Resolved"] as const;

function urgencyColors(u: string) {
  if (u === "Today") return { bg: "#FEF3F2", fg: "#B42318" };
  if (u === "Closed" || !u) return { bg: "#F2F4F7", fg: "#475467" };
  return { bg: "#FEF6E7", fg: "#B54708" };
}

export function OpportunityView() {
  const scope = useBrainScope();
  const store = useBrainStore();
  const fa = useFindingActions();
  const invalidate = useBrainInvalidate();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Opportunities");
  const { data, isLoading, error } = useQuery({ queryKey: ["brain-opportunity", scope], queryFn: () => fetchOpportunity(scope) });
  const remove = useMutation({
    mutationFn: removeWatch,
    onSuccess: () => {
      store.flash("Removed from the watchlist.");
      void invalidate();
    },
    onError: (e) => store.flash(errorText(e)),
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <div style={card}><Empty title="Could not read opportunities and risks" sub={errorText(error)} /></div>;

  const counts = { Opportunities: data.opportunities.length, Risks: data.risks.length, Watchlist: data.watches.length, Resolved: data.resolved.length };
  const cards: FindingCard[] = tab === "Opportunities" ? data.opportunities : tab === "Risks" ? data.risks : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "11px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#101828" }}>Opportunities and risks</h2>
          <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>Detected from your own records. Anything without evidence behind it is not listed.</div>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {TABS.map((k) => {
            const on = tab === k;
            return (
              <button key={k} type="button" onClick={() => setTab(k)} style={{ display: "flex", alignItems: "center", gap: "7px", border: `1px solid ${on ? "#12A150" : "#E6EAF0"}`, background: on ? "#F7FCF9" : "#fff", color: on ? "#0E8442" : "#475467", borderRadius: "20px", padding: "9px 14px", fontSize: "12px", fontWeight: 700, cursor: "pointer", minHeight: "42px" }}>
                {k}
                <span style={{ fontSize: "10.5px", opacity: 0.7 }}>{counts[k]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {(tab === "Opportunities" || tab === "Risks") && (
        <>
          {cards.length === 0 ? (
            <div style={card}>
              <Empty title={tab === "Opportunities" ? "No opportunities in your records right now" : "No risks crossed your thresholds"} sub={tab === "Opportunities" ? "Business Brain looks for quiet trading days, accepted quotations never converted and regular customers who have gone quiet." : "Credit, stock, returning buyers, branch margins, discounts, missing costs, deliveries and reviews are all being read."} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: "14px" }}>
              {cards.map((c) => {
                const tag = tab === "Risks" ? "Risk" : "Opportunity";
                const p = PRIO[tab === "Risks" ? c.kind : "Opportunity"];
                const u = urgencyColors(c.urgency);
                const bd = tab === "Risks" ? "#FDD9D6" : "#D5EFE0";
                return (
                  <div key={c.key} style={{ background: "#fff", border: `1px solid ${bd}`, borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "11px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                      <span style={{ width: "30px", height: "30px", borderRadius: "10px", background: p.bg, color: p.fg, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 30px" }}>
                        <Icon d={iconFor(c.key)} />
                      </span>
                      <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: p.fg, background: p.bg, borderRadius: "5px", padding: "3px 7px" }}>{tag}</span>
                      {c.watching && <span style={{ fontSize: "10px", fontWeight: 700, color: "#3538CD", background: "#EEF4FF", borderRadius: "5px", padding: "3px 7px" }}>Watching</span>}
                      <span style={{ marginLeft: "auto", fontSize: "10.5px", fontWeight: 700, color: u.fg, background: u.bg, borderRadius: "5px", padding: "3px 8px" }}>{c.urgency}</span>
                    </div>
                    <button type="button" onClick={() => store.openDrawer({ type: "finding", card: c })} style={{ border: 0, background: "none", padding: 0, textAlign: "left", fontSize: "13.5px", fontWeight: 800, color: "#101828", lineHeight: 1.4, cursor: "pointer" }}>
                      {c.t}
                    </button>
                    <div style={{ fontSize: "11.5px", color: "#475467", lineHeight: 1.55 }}>{c.d}</div>
                    <div style={{ borderTop: "1px solid #F2F4F7", paddingTop: "11px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {[
                        ["Detected from", c.src],
                        ["Affects", c.who],
                        ["Possible impact", c.impact],
                      ].map(([l, v]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "11.5px" }}>
                          <span style={{ color: "#98A2B3" }}>{l}</span>
                          <span style={{ color: "#344054", fontWeight: 600, textAlign: "right" }}>{v}</span>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "11.5px" }}>
                        <span style={{ color: "#98A2B3" }}>Confidence</span>
                        <span style={{ fontWeight: 800, color: CONF[c.conf].fg }}>{c.conf}</span>
                      </div>
                    </div>
                    {(c.action?.blockedReason || c.limit) && <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "10px", padding: "9px 11px", fontSize: "11px", fontWeight: 700, color: "#93370D", lineHeight: 1.5 }}>{c.action?.blockedReason ?? c.limit}</div>}
                    <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
                      <button type="button" disabled={fa.prepare.isPending} onClick={() => fa.primary(c)} className="bb-primary" style={{ border: 0, background: "#12A150", borderRadius: "10px", padding: "9px 14px", fontSize: "11.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "40px" }}>
                        {fa.primaryLabel(c)}
                      </button>
                      {!c.watching && (
                        <button type="button" onClick={() => fa.watch.mutate(c)} className="bb-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 14px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "40px" }}>
                          Watch
                        </button>
                      )}
                      <button type="button" onClick={() => fa.dismiss(c)} className="bb-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 14px", fontSize: "11.5px", fontWeight: 700, color: "#475467", cursor: "pointer", minHeight: "40px" }}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "Watchlist" && (
        <div style={{ ...card, padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "14.5px", fontWeight: 800, color: "#344054" }}>The watchlist lives below</div>
          <div style={{ fontSize: "12.5px", color: "#98A2B3", marginTop: "5px", maxWidth: "54ch", marginLeft: "auto", marginRight: "auto" }}>Everything you have asked to be told about is listed in the watchlist panel underneath, with the exact condition that triggers a message.</div>
        </div>
      )}

      {tab === "Resolved" &&
        (data.resolved.length === 0 ? (
          <div style={card}>
            <Empty title="Nothing resolved yet" sub={data.historyDays < 2 ? "Resolved means a finding raised in an earlier daily reading is no longer true. Daily readings are only just starting, so there is nothing to compare yet." : "No finding from the last 30 days of readings has stopped being true."} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: "14px" }}>
            {data.resolved.map((r) => (
              <div key={r.key} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "11px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                  <span style={{ width: "30px", height: "30px", borderRadius: "10px", background: "#F2F4F7", color: "#475467", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon d="m5 13 4 4L19 7" />
                  </span>
                  <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#475467", background: "#F2F4F7", borderRadius: "5px", padding: "3px 7px" }}>Resolved</span>
                  <span style={{ marginLeft: "auto", fontSize: "10.5px", fontWeight: 700, color: "#475467", background: "#F2F4F7", borderRadius: "5px", padding: "3px 8px" }}>Closed {r.closed}</span>
                </div>
                <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828", lineHeight: 1.4 }}>{r.t}</div>
                <div style={{ fontSize: "11.5px", color: "#475467", lineHeight: 1.55 }}>{r.d}</div>
              </div>
            ))}
          </div>
        ))}

      <section style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7" }}>
          <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Watchlist</h3>
          <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>Things you asked to be told about. Owners and Managers get a notification only when one actually trips.</div>
        </div>
        {data.watches.length === 0 && <Empty title="Nothing on the watchlist" sub="Press Watch on a finding, or add something below." />}
        {data.watches.map((w) => {
          const trig = w.st === "Triggered";
          return (
            <div key={w.id} style={{ padding: "13px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: "180px" }}>
                <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{w.n}</span>
                <span style={{ display: "block", fontSize: "11px", color: "#667085", marginTop: "3px" }}>
                  Tell me when {w.rule} · now {w.now}
                </span>
              </span>
              <span style={{ fontSize: "11.5px", fontWeight: 700, color: trig ? "#B42318" : "#475467", background: trig ? "#FEF3F2" : "#F2F4F7", borderRadius: "20px", padding: "5px 11px" }}>{w.st}</span>
              <button type="button" disabled={remove.isPending} onClick={() => remove.mutate(w.id)} className="bb-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: 700, color: "#475467", cursor: "pointer", minHeight: "38px" }}>
                Remove
              </button>
            </div>
          );
        })}
        <div style={{ padding: "14px 17px" }}>
          <button type="button" onClick={() => store.openModal({ type: "watch-create" })} className="bb-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "42px" }}>
            Watch something else
          </button>
        </div>
      </section>
    </div>
  );
}
