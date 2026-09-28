"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchCause, type Topic } from "@/lib/brain-api";
import { useBrainScope, useBrainStore } from "./brain-store";
import { Empty, Icon, Loading, card, errorText } from "./brain-ui";

const WHY_CHIPS: { q: string; topic: Topic }[] = [
  { q: "Why did profit change this week?", topic: "profit" },
  { q: "Why is a branch behind on margin?", topic: "margin" },
  { q: "Why did repeat customers buy less?", topic: "repeat" },
  { q: "Why is credit ageing?", topic: "credit" },
  { q: "Why did sales change?", topic: "revenue" },
];
const TONE: Record<string, { bd: string; bg: string; fg: string }> = {
  bad: { bd: "#FDD9D6", bg: "#FEF3F2", fg: "#B42318" },
  warn: { bd: "#FDE3B3", bg: "#FEF6E7", fg: "#B54708" },
  good: { bd: "#D5EFE0", bg: "#F7FCF9", fg: "#0E8442" },
  neutral: { bd: "#E6EAF0", bg: "#fff", fg: "#475467" },
};

export function CauseView() {
  const router = useRouter();
  const scope = useBrainScope();
  const pending = useBrainStore((s) => s.cause);
  const setPending = useBrainStore((s) => s.setCause);
  const flash = useBrainStore((s) => s.flash);
  const [text, setText] = useState("");
  const [req, setReq] = useState<{ topic?: Topic; q?: string }>(() => pending ?? { topic: "profit" });

  useEffect(() => {
    if (pending) setPending(null);
  }, [pending, setPending]);

  const { data, isLoading, error, isFetching } = useQuery({ queryKey: ["brain-cause", scope, req], queryFn: () => fetchCause({ ...scope, ...req }) });

  const investigate = () => {
    const q = text.trim();
    if (!q) {
      flash("Type a question first — for example, why did profit decline this week?");
      return;
    }
    setReq({ q });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div style={{ background: "#0A1B2A", borderRadius: "16px", padding: "18px" }}>
        <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: "#7C93A6" }}>Ask why</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            investigate();
          }}
          style={{ display: "flex", alignItems: "center", gap: "11px", background: "#0F2434", border: "1px solid #1D3547", borderRadius: "13px", padding: "5px 5px 5px 15px", marginTop: "11px" }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Why did profit decline this week?" aria-label="Ask why" style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", color: "#fff", fontSize: "13.5px", padding: "11px 0", minHeight: "46px", outline: "none" }} />
          <button type="submit" className="bb-primary" style={{ border: 0, background: "#12A150", borderRadius: "10px", padding: "11px 17px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px" }}>
            {isFetching ? "Investigating…" : "Investigate"}
          </button>
        </form>
        <div style={{ display: "flex", gap: "7px", flexWrap: "wrap", marginTop: "11px" }}>
          {WHY_CHIPS.map((c) => (
            <button
              key={c.q}
              type="button"
              onClick={() => {
                setText(c.q);
                setReq({ topic: c.topic, q: c.q });
              }}
              className="bb-dark-chip"
              style={{ border: `1px solid ${req.topic === c.topic ? "#12A150" : "#1D3547"}`, background: "transparent", borderRadius: "20px", padding: "7px 13px", fontSize: "11.5px", fontWeight: 600, color: req.topic === c.topic ? "#fff" : "#AFC0CE", cursor: "pointer", minHeight: "36px" }}
            >
              {c.q}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <Loading label="Investigating — reading the records behind it…" />}
      {error && <div style={card}><Empty title="Business Brain cannot break that question down" sub={errorText(error)} /></div>}

      {data && (
        <>
          <section style={{ background: "#fff", border: `1px solid ${data.reading ? "#FDD9D6" : "#E6EAF0"}`, borderRadius: "16px", padding: "17px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "13px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "220px" }}>
                <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#B42318" }}>Under investigation</div>
                <h2 style={{ margin: "7px 0 0", fontSize: "17px", fontWeight: 800, color: "#0F172A" }}>{data.headline}</h2>
                <div style={{ fontSize: "12.5px", color: "#475467", marginTop: "7px", lineHeight: 1.6 }}>{data.body}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(110px,1fr))", gap: "9px", flex: "0 0 auto" }}>
                <div style={{ border: "1px solid #E6EAF0", borderRadius: "11px", padding: "11px" }}>
                  <div style={{ fontSize: "10.5px", color: "#667085" }}>Period</div>
                  <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#0F172A", marginTop: "3px" }}>{data.period}</div>
                </div>
                <div style={{ border: "1px solid #E6EAF0", borderRadius: "11px", padding: "11px" }}>
                  <div style={{ fontSize: "10.5px", color: "#667085" }}>Covers</div>
                  <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#0F172A", marginTop: "3px" }}>{data.branches}</div>
                </div>
              </div>
            </div>
          </section>

          {!data.empty && (
            <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: "15px", alignItems: "start" }}>
              <section style={{ ...card, padding: "17px" }}>
                <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>What it breaks down into</h3>
                <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>Each line is a recorded total. Open one to see the records behind it.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "15px" }}>
                  {data.tree.length === 0 && <div style={{ fontSize: "12px", color: "#98A2B3" }}>Nothing to break down.</div>}
                  {data.tree.map((n, i) => {
                    const t = TONE[n.tone];
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={!n.link}
                        onClick={() => n.link && router.push(n.link.href)}
                        title={n.link ? n.link.label : undefined}
                        className="bb-accent"
                        style={{ display: "flex", alignItems: "center", gap: "11px", width: `calc(100% - ${n.level * 16}px)`, textAlign: "left", border: `1px solid ${t.bd}`, background: t.bg, borderRadius: "12px", padding: "12px 13px", marginLeft: `${n.level * 16}px`, cursor: n.link ? "pointer" : "default", minHeight: "52px" }}
                      >
                        <span style={{ width: "6px", height: "26px", borderRadius: "4px", background: t.fg, flex: "0 0 auto" }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{n.n}</span>
                          <span style={{ display: "block", fontSize: "11px", color: "#667085", marginTop: "3px", lineHeight: 1.45 }}>{n.d}</span>
                        </span>
                        <span style={{ fontSize: "12.5px", fontWeight: 800, color: t.fg, flex: "0 0 auto" }}>{n.v}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <section style={{ ...card, padding: "17px" }}>
                  <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>The reading</h3>
                  {!data.reading && <div style={{ fontSize: "12px", color: "#98A2B3", marginTop: "10px" }}>{data.body}</div>}
                  {data.reading && (
                    <>
                      <div style={{ background: "#FEF6E7", border: "1px solid #FDE3B3", borderRadius: "12px", padding: "13px", marginTop: "12px" }}>
                        <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#B54708" }}>{data.reading.mainLabel}</div>
                        <div style={{ fontSize: "13px", fontWeight: 800, color: "#101828", marginTop: "6px", lineHeight: 1.5 }}>{data.reading.main.t}</div>
                        <div style={{ fontSize: "11.5px", color: "#475467", marginTop: "5px", lineHeight: 1.55 }}>{data.reading.main.d}</div>
                      </div>
                      {data.reading.contrib.length > 0 && (
                        <>
                          <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", margin: "15px 0 8px" }}>Also contributing</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {data.reading.contrib.map((c) => (
                              <div key={c.t} style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                                <span style={{ flex: 1, fontSize: "12px", color: "#344054", lineHeight: 1.5 }}>{c.t}</span>
                                <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#0F172A", flex: "0 0 auto" }}>{c.share}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", margin: "15px 0 8px" }}>Other explanations considered</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {data.reading.alts.map((a) => (
                          <div key={a.t} style={{ border: "1px solid #E6EAF0", borderRadius: "11px", padding: "11px" }}>
                            <div style={{ fontSize: "12px", fontWeight: 700, color: "#101828" }}>{a.t}</div>
                            <div style={{ fontSize: "11px", color: "#667085", marginTop: "4px", lineHeight: 1.5 }}>{a.d}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ background: data.reading.caveat ? "#FFFBF2" : "#F7FCF9", border: `1px solid ${data.reading.caveat ? "#FDE3B3" : "#D5EFE0"}`, borderRadius: "11px", padding: "12px", marginTop: "14px", fontSize: "11.5px", fontWeight: 700, color: data.reading.caveat ? "#93370D" : "#0E8442", lineHeight: 1.55 }}>
                        {data.reading.caveat || `Confidence is ${data.reading.conf.toLowerCase()} — every figure above is a recorded total.`}
                      </div>
                    </>
                  )}
                </section>

                <section style={{ ...card, padding: "17px" }}>
                  <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>How it was checked</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "9px", marginTop: "13px" }}>
                    {data.steps.map((s) => (
                      <div key={s.n} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: s.done ? "#E8F7EE" : "#FEF6E7", color: s.done ? "#0E8442" : "#B54708", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 20px" }}>
                          <Icon d={s.done ? "m5 13 4 4L19 7" : "M12 9v5M12 17.5h.01"} size={11} width={3} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: "12px", color: "#344054" }}>{s.n}</span>
                        <span style={{ fontSize: "10.5px", color: "#98A2B3" }}>{s.r}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "15px" }}>
                    {data.multiBranch && data.topic !== "margin" && (
                      <button type="button" onClick={() => setReq({ topic: "margin" })} className="bb-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "42px" }}>
                        Compare branches
                      </button>
                    )}
                    {data.missingCosts > 0 && (
                      <button type="button" onClick={() => router.push("/products")} className="bb-primary" style={{ border: 0, background: "#12A150", borderRadius: "10px", padding: "10px 14px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "42px" }}>
                        Fix the {data.missingCosts} missing costs
                      </button>
                    )}
                  </div>
                </section>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
