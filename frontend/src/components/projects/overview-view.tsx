"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchOverview } from "@/lib/projects-api";
import { useProjectsStore } from "./projects-store";
import { Avatar, ErrorBox, Loading, Svg, ago, card, fmt, health, left, pillBtn } from "./projects-ui";

const PERIODS = ["Today", "This Week", "This Month", "Quarter"];
const TONE: Record<string, string> = { good: "#067647", bad: "#B42318", warn: "#B54708", neutral: "#667085", muted: "#98A2B3" };
const SEV: Record<string, { bg: string; fg: string }> = { HIGH: { bg: "#FEF3F2", fg: "#B42318" }, MED: { bg: "#FEF6E7", fg: "#B54708" }, LOW: { bg: "#F2F4F7", fg: "#475467" } };

export function OverviewView() {
  const router = useRouter();
  const scope = useProjectsStore((s) => s.scope);
  const open = useProjectsStore((s) => s.open);
  const setProjFilters = useProjectsStore((s) => s.setProjFilters);
  const setTaskFilters = useProjectsStore((s) => s.setTaskFilters);
  const setMsView = useProjectsStore((s) => s.setMsView);
  const [period, setPeriod] = useState("This Month");
  const { data, error, isLoading, dataUpdatedAt } = useQuery({ queryKey: ["projects-overview", period, scope], queryFn: () => fetchOverview(period, scope), refetchInterval: 120000 });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  if (isLoading) return <Loading label="Reading your projects…" />;
  if (error || !data) return <ErrorBox error={error} />;

  const kpiGo = (go: string, f: string) => {
    if (go === "projects") {
      setProjFilters({ view: f === "At Risk" ? "At Risk" : f === "Active" ? "Active" : f === "Completed" ? "Completed" : "All Projects", fHealth: "All health", fStatus: "All statuses", q: "" });
      router.push("/projects/all");
    } else if (go === "tasks") {
      setTaskFilters({ tview: f || "All Tasks", tq: "" });
      router.push("/projects/tasks");
    } else if (go === "milestones") {
      setMsView(f || "All");
      router.push("/projects/milestones");
    } else router.push("/projects/" + go);
  };
  const upd = dataUpdatedAt ? Math.max(0, Math.round((now - dataUpdatedAt) / 60000)) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {PERIODS.map((p) => (
          <button key={p} type="button" onClick={() => setPeriod(p)} style={{ ...pillBtn(period === p), padding: "7px 13px" }}>
            {p}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: "11.5px", color: "#667085", display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#12A150" }} />
          Updated {upd < 1 ? "just now" : `${upd} min ago`} · {fmt(data.today)}
        </span>
      </div>

      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "12px" }}>
        {data.kpis.map((k) => (
          <button key={k.label} type="button" className="pt-hovsh" onClick={() => kpiGo(k.go, k.f)} style={{ textAlign: "left", background: "#fff", border: "1px solid #E6EAF0", borderRadius: "14px", padding: "14px 15px", cursor: "pointer", display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontWeight: 700, color: "#667085" }}>
              {k.label}
              <span style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 600, color: "#98A2B3" }}>{k.period}</span>
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-.6px", color: "#0F172A" }}>{k.value}</div>
            <div style={{ fontSize: "11.5px", fontWeight: 600, color: TONE[k.cmpTone] ?? "#667085" }}>{k.cmp}</div>
            <div style={{ fontSize: "10.5px", color: "#98A2B3" }}>{k.fresh}</div>
          </button>
        ))}
      </div>

      <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: "15px" }}>
        <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h2 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Portfolio health</h2>
            <span style={{ fontSize: "11.5px", color: "#667085" }}>{data.projectCount} projects · click a segment to filter</span>
          </div>
          <div style={{ display: "flex", height: "14px", borderRadius: "8px", overflow: "hidden", gap: "2px", background: data.projectCount ? undefined : "#F2F4F7" }}>
            {data.healthSeg.map((h) => (
              <div key={h.label} style={{ flex: h.n, background: health(h.label).bar }} />
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: "8px" }}>
            {data.healthSeg.map((h) => {
              const m = health(h.label);
              return (
                <button
                  key={h.label}
                  type="button"
                  className="pt-hov"
                  onClick={() => {
                    setProjFilters({ view: "All Projects", fHealth: h.label, fStatus: "All statuses", q: "" });
                    router.push("/projects/all");
                  }}
                  style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "11px", padding: "9px 10px", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: "4px" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 700, color: m.fg === "#fff" ? m.bar : m.fg }}>
                    <Svg d={m.icon} size={13} sw={2.2} />
                    {h.label}
                  </span>
                  <span style={{ fontSize: "18px", fontWeight: 800, color: "#101828" }}>{h.n}</span>
                </button>
              );
            })}
          </div>
          <div style={{ borderTop: "1px solid #F0F2F5", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "11px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#344054" }}>Project progress</div>
            {data.progress.map((p) => (
              <button key={p.id} type="button" onClick={() => open({ kind: "qp", id: p.id })} style={{ border: 0, background: "none", padding: 0, cursor: "pointer", display: "grid", gridTemplateColumns: "minmax(0,190px) minmax(0,1fr) 44px", gap: "12px", alignItems: "center", textAlign: "left" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 600, color: "#101828", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                <span style={{ height: "8px", background: "#F2F4F7", borderRadius: "6px", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: p.progress + "%", background: health(p.health).bar, borderRadius: "6px" }} />
                </span>
                <span style={{ fontSize: "12px", fontWeight: 800, color: "#344054", textAlign: "right" }}>{p.progress}%</span>
              </button>
            ))}
            {!data.progress.length && <div style={{ fontSize: "12.5px", color: "#667085" }}>No projects yet — create one with New Project.</div>}
          </div>
        </section>

        <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h2 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Project risks</h2>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#B42318", background: "#FEF3F2", borderRadius: "20px", padding: "2px 8px" }}>{data.risks.length}</span>
          </div>
          <div style={{ background: "#F3FBF6", border: "1px solid #D1F2DE", borderRadius: "12px", padding: "12px 13px", display: "flex", flexDirection: "column", gap: "7px" }}>
            <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#0E8442" }}>AI project insight</div>
            <div style={{ fontSize: "12.5px", color: "#101828", lineHeight: 1.5, fontWeight: 600 }}>{data.aiInsight}</div>
            <div style={{ fontSize: "11px", color: "#475467", lineHeight: 1.5 }}>{data.aiEvidence}</div>
            <button
              type="button"
              className="pt-primary"
              onClick={() => {
                setProjFilters({ view: "At Risk", fHealth: "All health", fStatus: "All statuses", q: "" });
                router.push("/projects/all");
              }}
              style={{ alignSelf: "flex-start", border: 0, background: "#12A150", color: "#fff", borderRadius: "9px", padding: "8px 13px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
            >
              Review risks
            </button>
          </div>
          {data.risks.map((r, i) => (
            <button key={i} type="button" className="pt-soft" onClick={() => r.pid && open({ kind: "qp", id: r.pid })} style={{ border: "1px solid #F0F2F5", background: "#fff", borderRadius: "11px", padding: "10px 12px", cursor: "pointer", textAlign: "left", display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <span style={{ fontSize: "10px", fontWeight: 800, color: SEV[r.sev].fg, background: SEV[r.sev].bg, borderRadius: "5px", padding: "2px 6px", flex: "0 0 auto", marginTop: "1px" }}>{r.sev}</span>
              <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{r.t}</span>
                <span style={{ fontSize: "11.5px", color: "#667085" }}>{r.d}</span>
              </span>
            </button>
          ))}
          {!data.risks.length && <div style={{ fontSize: "12.5px", color: "#667085" }}>No risks found in project, task and time records.</div>}
        </section>
      </div>

      <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "15px" }}>
        <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <h2 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Upcoming milestones</h2>
          {data.milestones.map((m) => {
            const [lt, lfg] = left(m.date, data.today);
            return (
              <button key={m.id} type="button" onClick={() => open({ kind: "ms", id: m.id })} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "8px 0", border: 0, borderBottom: "1px solid #F4F5F7", background: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ width: "9px", height: "9px", transform: "rotate(45deg)", background: health(m.projectHealth).bar, flex: "0 0 9px" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{m.name}</div>
                  <div style={{ fontSize: "11px", color: "#667085" }}>
                    {m.projectName} · {m.owner}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#344054" }}>{fmt(m.date)}</div>
                  <div style={{ fontSize: "10.5px", fontWeight: 700, color: lfg }}>{lt}</div>
                </div>
              </button>
            );
          })}
          {!data.milestones.length && <div style={{ fontSize: "12.5px", color: "#667085" }}>No upcoming milestones.</div>}
        </section>

        <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Team workload · this week</h2>
            <div style={{ fontSize: "11px", color: "#667085", marginTop: "3px" }}>From task estimates vs. scheduled shifts. Attendance stays in Staff.</div>
          </div>
          {data.workload.map((w) => {
            const pct = w.capacity ? Math.round((w.hours / w.capacity) * 100) : null;
            const bar = pct == null ? "#D0D5DD" : pct > 100 ? "#F04438" : pct > 85 ? "#F79009" : "#12A150";
            return (
              <div key={w.id} style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "4px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                  <Avatar name={w.name} />
                  <span style={{ fontWeight: 700, color: "#101828", flex: 1 }}>{w.name}</span>
                  <span style={{ color: "#667085" }}>{w.capacity != null ? `${w.hours} / ${Math.round(w.capacity * 10) / 10} h` : `${w.hours} h · no shifts`}</span>
                  <span style={{ fontWeight: 800, color: pct != null && pct > 100 ? "#B42318" : "#344054" }}>{pct != null ? pct + "%" : "—"}</span>
                </div>
                <div style={{ height: "6px", background: "#F2F4F7", borderRadius: "6px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: Math.min(pct ?? 0, 100) + "%", background: bar }} />
                </div>
                <div style={{ fontSize: "10.5px", color: "#98A2B3" }}>
                  {w.tasks} tasks · {w.overdue} overdue
                </div>
              </div>
            );
          })}
          {!data.workload.length && <div style={{ fontSize: "12.5px", color: "#667085" }}>No open tasks are assigned yet.</div>}
        </section>

        <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Recent activity</h2>
          {data.activity.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: "10px", padding: "7px 0", borderBottom: "1px solid #F4F5F7" }}>
              <Avatar name={a.who} size={26} bg="#F2F4F7" fg="#344054" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "12px", color: "#344054", lineHeight: 1.45 }}>
                  <b style={{ color: "#101828" }}>{a.who}</b> {a.what}
                </div>
                <div style={{ fontSize: "10.5px", color: "#98A2B3" }}>
                  {ago(a.when, now)} · {a.ev}
                </div>
              </div>
            </div>
          ))}
          {!data.activity.length && <div style={{ fontSize: "12.5px", color: "#667085" }}>Nothing has happened yet.</div>}
        </section>
      </div>
    </div>
  );
}
