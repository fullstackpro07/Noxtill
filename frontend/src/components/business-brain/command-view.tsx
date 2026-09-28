"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { askBrain, fetchCommand, type AskAnswer } from "@/lib/brain-api";
import { useBrainScope, useBrainStore } from "./brain-store";
import { useFindingActions } from "./finding-actions";
import { CONF, Empty, Icon, Loading, PRIO, card, errorText, iconFor } from "./brain-ui";

const STATE: Record<string, { bg: string; bd: string; fg: string; dot: string }> = {
  "Action needed": { bg: "#3B1716", bd: "#7A2621", fg: "#FFB4AE", dot: "#F04438" },
  "Attention needed": { bg: "#3A2A0C", bd: "#7A5314", fg: "#FFD08A", dot: "#F79009" },
  Steady: { bg: "#0D3321", bd: "#1E6B45", fg: "#8EF0BA", dot: "#12A150" },
};
const TRUST: Record<string, { dot: string; fg: string }> = {
  ok: { dot: "#12A150", fg: "#39E28B" },
  stale: { dot: "#F79009", fg: "#FFB454" },
  old: { dot: "#F79009", fg: "#FFB454" },
  bad: { dot: "#F04438", fg: "#FF7B72" },
  none: { dot: "#98A2B3", fg: "#AFC0CE" },
};
const CHIPS = ["What needs my attention?", "Why are sales down?", "Where am I losing money?", "What should I focus on today?", "Run a business review"];
const ATTN_FILTERS = ["Everything", "Critical", "Attention", "Opportunity"];

export function CommandView() {
  const router = useRouter();
  const scope = useBrainScope();
  const store = useBrainStore();
  const fa = useFindingActions();
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({ "What changed": true });
  const { data, isLoading, error } = useQuery({ queryKey: ["brain-command", scope], queryFn: () => fetchCommand(scope), refetchInterval: 120000 });
  const ask = useMutation({
    mutationFn: (question: string) => askBrain(question, scope.branch),
    onSuccess: (a) => setAnswer(a),
    onError: (e) => store.flash(errorText(e)),
  });
  const review = useMutation({
    mutationFn: () => askBrain("Run a business review", scope.branch),
    onSuccess: (a) => store.openModal({ type: "answer", answer: a }),
    onError: (e) => store.flash(errorText(e)),
  });

  const run = (text: string) => {
    const t = text.trim();
    if (!t) {
      store.flash("Type a question first — Business Brain answers from your records, not from guesswork.");
      return;
    }
    setQ(t);
    ask.mutate(t);
  };

  if (isLoading) return <Loading />;
  if (error || !data) return <div style={card}><Empty title="Business Brain could not read your records" sub={errorText(error)} /></div>;

  const st = STATE[data.state.label] ?? STATE.Steady;
  const counts = [
    { k: "Critical", v: data.state.counts.critical, c: "#FF7B72" },
    { k: "Attention", v: data.state.counts.attention, c: "#FFB454" },
    { k: "Opportunity", v: data.state.counts.opportunity, c: "#39E28B" },
    { k: "Improving", v: data.state.counts.improving, c: "#8FD5FF" },
  ];
  const shown = data.attention.filter((a) => store.attn === "Everything" || a.kind === store.attn);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div style={{ background: "#0A1B2A", borderRadius: "18px", padding: "20px", display: "flex", flexDirection: "column", gap: "15px" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(q);
          }}
          style={{ display: "flex", alignItems: "center", gap: "11px", background: "#0F2434", border: "1px solid #1D3547", borderRadius: "13px", padding: "5px 5px 5px 15px" }}
        >
          <Icon d="M12 3a4 4 0 0 0-4 4 3 3 0 0 0-.5 5.9A3.5 3.5 0 0 0 11 21h1V3Zm0 0a4 4 0 0 1 4 4 3 3 0 0 1 .5 5.9A3.5 3.5 0 0 1 13 21h-1" size={16} stroke="#39E28B" />
          <input
            id="bb-ask"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask Business Brain anything about your business…"
            aria-label="Ask Business Brain"
            style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", color: "#fff", fontSize: "13.5px", padding: "11px 0", minHeight: "46px", outline: "none" }}
          />
          <button type="submit" disabled={ask.isPending} className="bb-primary" style={{ border: 0, background: "#12A150", borderRadius: "10px", padding: "11px 17px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px" }}>
            {ask.isPending ? "Reading…" : "Ask"}
          </button>
        </form>
        <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
          {CHIPS.map((c) => (
            <button key={c} type="button" onClick={() => run(c)} className="bb-dark-chip" style={{ border: "1px solid #1D3547", background: "transparent", borderRadius: "20px", padding: "7px 13px", fontSize: "11.5px", fontWeight: 600, color: "#AFC0CE", cursor: "pointer", minHeight: "36px" }}>
              {c}
            </button>
          ))}
        </div>
        {answer && (
          <div style={{ background: "#0F2434", border: "1px solid #1D3547", borderRadius: "13px", padding: "15px 17px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ flex: 1, fontSize: "12px", fontWeight: 800, color: "#fff" }}>{answer.question}</span>
              <button type="button" onClick={() => setAnswer(null)} aria-label="Close answer" style={{ border: 0, background: "none", color: "#7C93A6", cursor: "pointer", fontSize: "14px" }}>
                ✕
              </button>
            </div>
            <div style={{ fontSize: "13px", lineHeight: 1.65, color: "#E7EEF4", marginTop: "9px", whiteSpace: "pre-wrap" }}>{answer.answer}</div>
            <div style={{ fontSize: "10.5px", color: "#7C93A6", marginTop: "10px" }}>{answer.note}</div>
          </div>
        )}

        <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: "15px" }}>
          <div style={{ background: "#0F2434", border: "1px solid #1D3547", borderRadius: "15px", padding: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", background: st.bg, border: `1px solid ${st.bd}`, borderRadius: "20px", padding: "6px 13px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: st.dot }} />
                <span style={{ fontSize: "11.5px", fontWeight: 800, letterSpacing: ".3px", textTransform: "uppercase", color: st.fg }}>{data.state.label}</span>
              </span>
              <span style={{ fontSize: "11px", color: "#7C93A6" }}>
                Read at {data.state.at} · {data.state.window}
              </span>
            </div>
            <p style={{ margin: "14px 0 0", fontSize: "15px", lineHeight: 1.65, color: "#E7EEF4", fontWeight: 500, textWrap: "pretty" } as React.CSSProperties}>{data.state.summary}</p>
            <div style={{ fontSize: "11px", color: "#7C93A6", marginTop: "12px", lineHeight: 1.5 }}>{data.state.basis}</div>
            <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "10px", marginTop: "16px" }}>
              {counts.map((c) => (
                <button
                  key={c.k}
                  type="button"
                  onClick={() => (c.k === "Improving" ? document.getElementById("bb-positives")?.scrollIntoView({ behavior: "smooth" }) : store.setAttn(c.k))}
                  className="bb-accent"
                  style={{ border: "1px solid #1D3547", background: "#0A1B2A", borderRadius: "12px", padding: "12px", textAlign: "left", cursor: "pointer" }}
                >
                  <span style={{ display: "block", fontSize: "22px", fontWeight: 800, color: c.c, lineHeight: 1.1 }}>{c.v}</span>
                  <span style={{ display: "block", fontSize: "11px", color: "#8EA3B4", marginTop: "4px" }}>{c.k}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ background: "#0F2434", border: "1px solid #1D3547", borderRadius: "15px", padding: "18px", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: "#7C93A6" }}>Where the reading comes from</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "9px", marginTop: "13px", flex: 1 }}>
              {data.trust.map((t) => (
                <div key={t.n} title={t.why} style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: (TRUST[t.level] ?? TRUST.none).dot, flex: "0 0 auto" }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: "12px", color: "#D3DEE7" }}>{t.n}</span>
                  <span style={{ fontSize: "10.5px", fontWeight: 700, color: (TRUST[t.level] ?? TRUST.none).fg }}>{t.st}</span>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => router.push("/business-brain/settings")} className="bb-dark-chip" style={{ marginTop: "14px", border: "1px solid #1D3547", background: "transparent", borderRadius: "10px", padding: "10px 13px", fontSize: "11.5px", fontWeight: 700, color: "#AFC0CE", cursor: "pointer", minHeight: "42px" }}>
              Open data trust centre
            </button>
          </div>
        </div>
      </div>

      <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: "15px", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          <section style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "center", gap: "11px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "170px" }}>
                <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#101828" }}>Needs your attention</h2>
                <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>Ordered by what it costs you, not by when it happened.</div>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {ATTN_FILTERS.map((k) => {
                  const on = store.attn === k;
                  return (
                    <button key={k} type="button" onClick={() => store.setAttn(k)} style={{ border: `1px solid ${on ? "#12A150" : "#E6EAF0"}`, background: on ? "#F7FCF9" : "#fff", color: on ? "#0E8442" : "#475467", borderRadius: "20px", padding: "7px 12px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", minHeight: "38px" }}>
                      {k}
                    </button>
                  );
                })}
              </div>
            </div>
            {shown.map((a) => {
              const p = PRIO[a.kind];
              const c = CONF[a.conf];
              return (
                <div key={a.key} style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", gap: "13px", alignItems: "flex-start" }}>
                  <span style={{ width: "34px", height: "34px", borderRadius: "11px", background: p.bg, color: p.fg, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 34px" }}>
                    <Icon d={iconFor(a.key)} size={16} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: p.fg, background: p.bg, borderRadius: "5px", padding: "3px 7px" }}>{a.kind}</span>
                      <span style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>{a.t}</span>
                      {a.watching && <span style={{ fontSize: "10px", fontWeight: 700, color: "#3538CD", background: "#EEF4FF", borderRadius: "5px", padding: "3px 7px" }}>Watching</span>}
                    </div>
                    <div style={{ fontSize: "12.5px", color: "#475467", marginTop: "6px", lineHeight: 1.55 }}>{a.d}</div>
                    <div style={{ display: "flex", gap: "9px", flexWrap: "wrap", marginTop: "9px" }}>
                      <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#475467", background: "#F2F4F7", borderRadius: "5px", padding: "3px 8px" }}>{a.src}</span>
                      <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#3538CD", background: "#EEF4FF", borderRadius: "5px", padding: "3px 8px" }}>{a.impact}</span>
                      <span style={{ fontSize: "10.5px", fontWeight: 700, color: c.fg, background: c.bg, borderRadius: "5px", padding: "3px 8px" }}>{a.conf} confidence</span>
                      <span style={{ fontSize: "10.5px", color: "#98A2B3", padding: "3px 0" }}>{a.urgency}</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                      <button type="button" onClick={() => store.openDrawer({ type: "finding", card: a })} className="bb-primary" style={{ border: 0, background: "#12A150", borderRadius: "10px", padding: "9px 15px", fontSize: "11.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "40px" }}>
                        Look into it
                      </button>
                      <button type="button" disabled={fa.prepare.isPending} onClick={() => fa.primary(a)} className="bb-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 15px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "40px" }}>
                        {fa.primaryLabel(a)}
                      </button>
                      {!a.watching && (
                        <button type="button" onClick={() => fa.watch.mutate(a)} className="bb-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 15px", fontSize: "11.5px", fontWeight: 700, color: "#475467", cursor: "pointer", minHeight: "40px" }}>
                          Watch
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {shown.length === 0 && <Empty title={data.attention.length ? "Nothing in this filter" : "Nothing needs your attention"} sub="Business Brain keeps reading credit, stock, customers, branches, discounts, deliveries, reviews and quotations. An empty list here is a good sign, not a broken one." />}
          </section>

          <section style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7" }}>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#101828" }}>Executive brief</h2>
              <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>
                Written at {data.state.at} from this reading, {data.scope.compare}. Open a section for the working.
              </div>
            </div>
            {data.brief.map((b) => {
              const isOpen = !!open[b.k];
              return (
                <div key={b.k} style={{ borderBottom: "1px solid #F2F4F7" }}>
                  <button type="button" onClick={() => setOpen((o) => ({ ...o, [b.k]: !o[b.k] }))} className="bb-row" style={{ display: "flex", alignItems: "center", gap: "11px", width: "100%", textAlign: "left", border: 0, background: isOpen ? "#FAFBFC" : "#fff", padding: "14px 17px", cursor: "pointer", minHeight: "48px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: "#98A2B3", width: "96px", flex: "0 0 auto" }}>{b.k}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{b.head}</span>
                    <span style={{ display: "flex", transform: `rotate(${isOpen ? 180 : 0}deg)`, flex: "0 0 auto" }}>
                      <Icon d="m6 9 6 6 6-6" size={14} stroke="#98A2B3" width={2.2} />
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: "0 17px 16px 130px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      {b.lines.map((l, i) => (
                        <div key={i} style={{ display: "flex", gap: "9px" }}>
                          <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#12A150", flex: "0 0 auto", marginTop: "7px" }} />
                          <span style={{ fontSize: "12.5px", color: "#475467", lineHeight: 1.6 }}>{l}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ padding: "14px 17px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" disabled={review.isPending} onClick={() => review.mutate()} className="bb-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "42px" }}>
                {review.isPending ? "Reading…" : "Run a full business review"}
              </button>
              <button type="button" onClick={() => router.push("/business-brain/situation")} className="bb-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "42px" }}>
                See everything that changed
              </button>
            </div>
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          <section style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 style={{ margin: 0, flex: 1, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Prepared, waiting on you</h2>
              <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#B54708", background: "#FEF6E7", borderRadius: "20px", padding: "4px 10px" }}>{data.preparedCount} waiting</span>
            </div>
            {data.prepared.length === 0 && <Empty title="Nothing prepared" sub="Use a finding’s action button to prepare one. Nothing is ever prepared or sent without someone asking." />}
            {data.prepared.map((p) => (
              <div key={p.id} style={{ padding: "14px 17px", borderBottom: "1px solid #F2F4F7" }}>
                <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{p.title}</div>
                <div style={{ fontSize: "11.5px", color: "#667085", marginTop: "5px", lineHeight: 1.5 }}>{p.status === "blocked" && p.blockedReason ? p.blockedReason : p.detail}</div>
                <div style={{ display: "flex", gap: "7px", flexWrap: "wrap", marginTop: "10px" }}>
                  <button type="button" onClick={() => router.push("/business-brain/actions")} className="bb-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "38px" }}>
                    Review
                  </button>
                  {p.status === "prepared" && p.canApprove && (
                    <button type="button" disabled={fa.approve.isPending} onClick={() => fa.approve.mutate(p.id)} className="bb-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "38px" }}>
                      Approve
                    </button>
                  )}
                  {p.status === "approved" && <span style={{ fontSize: "11px", fontWeight: 800, color: "#0E8442", alignSelf: "center" }}>Approved — run it in the Action Center</span>}
                  {p.status === "blocked" && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", border: "1px solid #FDD9D6", background: "#FEF3F2", borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: 800, color: "#B42318", minHeight: "38px" }}>
                      <Icon d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" size={13} width={2.2} />
                      Blocked
                    </span>
                  )}
                  <span style={{ fontSize: "10.5px", color: "#98A2B3", alignSelf: "center" }}>{p.perm}</span>
                </div>
              </div>
            ))}
            <div style={{ padding: "13px 17px", fontSize: "11px", color: "#98A2B3", lineHeight: 1.5 }}>Nothing here has been sent, charged or changed. Approval, then Run, is the only thing that executes it.</div>
          </section>

          <section style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7" }}>
              <h2 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Business signals</h2>
              <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>Compared {data.scope.compare.replace(/^vs /, "with ")}. Tap one for the reading behind it.</div>
            </div>
            {data.signals.map((g) => {
              const dot = g.tone === "good" ? "#12A150" : g.tone === "bad" ? "#F04438" : "#98A2B3";
              const fg = g.tone === "good" ? "#0E8442" : g.tone === "bad" ? "#B42318" : "#475467";
              return (
                <button key={g.key} type="button" onClick={() => store.openDrawer({ type: "signal", signal: g })} className="bb-row" style={{ display: "flex", alignItems: "center", gap: "11px", width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #F2F4F7", background: "#fff", padding: "12px 17px", cursor: "pointer", minHeight: "52px" }}>
                  <span style={{ width: "6px", height: "26px", borderRadius: "4px", background: dot, flex: "0 0 auto" }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{g.n}</span>
                    <span style={{ display: "block", fontSize: "11px", color: "#98A2B3", marginTop: "3px" }}>{g.why}</span>
                  </span>
                  <span style={{ textAlign: "right", flex: "0 0 auto" }}>
                    <span style={{ display: "block", fontSize: "13px", fontWeight: 800, color: "#0F172A" }}>{g.v}</span>
                    <span style={{ display: "block", fontSize: "11px", fontWeight: 700, color: fg, marginTop: "2px" }}>{g.ch}</span>
                  </span>
                </button>
              );
            })}
          </section>

          <section id="bb-positives" style={{ background: "#fff", border: "1px solid #D5EFE0", borderRadius: "16px", padding: "17px" }}>
            <h2 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Going the right way</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "11px", marginTop: "13px" }}>
              {data.positives.length === 0 && <div style={{ fontSize: "12px", color: "#98A2B3" }}>Nothing improved past your thresholds this period.</div>}
              {data.positives.map((p) => (
                <div key={p.t} style={{ display: "flex", gap: "10px" }}>
                  <span style={{ flex: "0 0 15px", marginTop: "2px", display: "flex" }}>
                    <Icon d="m5 13 4 4L19 7" size={15} stroke="#0E8442" width={2.4} />
                  </span>
                  <div>
                    <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{p.t}</div>
                    <div style={{ fontSize: "11px", color: "#667085", marginTop: "3px", lineHeight: 1.5 }}>{p.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
