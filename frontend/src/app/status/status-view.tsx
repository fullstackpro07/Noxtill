"use client";

import { useEffect, useState } from "react";
import { s } from "@/components/site/legal/s";
import { fetchPublicStatus, type PublicStatus } from "@/lib/legal-public-api";

type Phase = "loading" | "live" | "error";
const M: Record<string, [string, string, string]> = {
  operational: ["Operational", "#04573C", "#079A63"],
  degraded: ["Degraded performance", "#6E4400", "#B7791F"],
  outage: ["Outage", "#8A2A1E", "#B4362A"],
  maintenance: ["Maintenance", "#24343C", "#4C5B63"],
};

/** Banner, components and incidents — driven only by the live status check (backend/src/legal-public). */
export function StatusView({ names, stages }: { names: string[]; stages: string[] }) {
  const [data, setData] = useState<PublicStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  useEffect(() => {
    fetchPublicStatus()
      .then((d) => {
        setData(d);
        setPhase("live");
      })
      .catch(() => setPhase("error"));
  }, []);

  const live = phase === "live" && data ? data : null;
  const comps = live?.components ?? [];
  const worst = live
    ? comps.some((c) => c.status === "outage")
      ? "outage"
      : comps.some((c) => c.status === "degraded")
        ? "degraded"
        : comps.length && comps.every((c) => c.status === "operational")
          ? "operational"
          : "maintenance"
    : null;
  let b: [string, string, string, string, string, string] =
    phase === "loading"
      ? ["Checking live status…", "Contacting the monitoring service.", "#F7FAF8", "#0B1822", "#E3EEE8", "#9FB3AA"]
      : ["Status temporarily unavailable", "We couldn’t reach the monitoring service. This does not indicate an outage. Try again shortly or contact support@noxtill.com.", "#FFF4E0", "#4A3000", "#F2D49B", "#B7791F"];
  if (live && worst) {
    const summary = { operational: "All systems operational", degraded: "Some systems degraded", outage: "Service disruption", maintenance: "Maintenance in progress" }[worst];
    b = [
      live.summary || summary,
      "Reported by a live check of the Noxtill API and database. Components without a live check are marked “Not monitored”.",
      worst === "operational" ? "#DDF6EA" : worst === "outage" ? "#FDE7E4" : "#FFF4E0",
      "#0B1822",
      "#D9E8E0",
      M[worst][2],
    ];
  }
  const components = names.map((name) => {
    const c = comps.find((x) => x.name === name);
    const m = c && M[c.status];
    return m ? { name, label: m[0], fg: m[1], dot: m[2] } : { name, label: live ? "Not monitored" : "No live data", fg: "#4C5B63", dot: "#9FB3AA" };
  });
  const incidents = live?.incidents ?? [];

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        style={s(`display: flex; flex-wrap: wrap; align-items: center; gap: 14px 20px; padding: 22px 24px; border-radius: 18px; background: ${b[2]}; color: ${b[3]}; border: 1px solid ${b[4]};`)}
      >
        <span aria-hidden="true" style={s(`width: 16px; height: 16px; border-radius: 50%; background: ${b[5]}; flex-shrink: 0;`)} />
        <div style={s("flex: 1 1 360px;")}>
          <p style={s("margin: 0; font-size: 20px; font-weight: 800;")}>{b[0]}</p>
          <p style={s("margin: 4px 0 0; font-size: 15px; line-height: 1.55;")}>{b[1]}</p>
        </div>
        <span style={s("font-size: 13px; font-weight: 600;")}>{live?.checkedAt ? `Checked ${new Date(live.checkedAt).toLocaleString()}` : ""}</span>
      </div>

      <section aria-labelledby="comp-h" style={s("padding: 32px 0 12px;")}>
        <h2 id="comp-h" style={s("margin: 0 0 12px; font-size: 20px; font-weight: 800;")}>
          Components
        </h2>
        <table style={s("width: 100%; border-collapse: collapse; font-size: 15px; border: 1px solid #D9E8E0; border-radius: 14px; overflow: hidden;")}>
          <caption style={s("text-align: left; padding: 0 0 8px; font-size: 13px; color: #4C5B63;")}>Status reported by live monitoring for each service component</caption>
          <thead>
            <tr style={s("background: #F7FAF8;")}>
              <th scope="col" style={s("text-align: left; padding: 12px 16px;")}>
                Component
              </th>
              <th scope="col" style={s("text-align: left; padding: 12px 16px;")}>
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {components.map((c) => (
              <tr key={c.name} style={s("border-top: 1px solid #E3EEE8;")}>
                <th scope="row" style={s("text-align: left; padding: 13px 16px; font-weight: 600;")}>
                  {c.name}
                </th>
                <td style={s("padding: 13px 16px;")}>
                  <span style={s(`display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: ${c.fg};`)}>
                    <span aria-hidden="true" style={s(`width: 10px; height: 10px; border-radius: 50%; background: ${c.dot};`)} />
                    {c.label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="inc-h" style={s("padding: 32px 0 12px;")}>
        <h2 id="inc-h" style={s("margin: 0 0 12px; font-size: 20px; font-weight: 800;")}>
          Incidents and maintenance
        </h2>
        <ol style={s("list-style: none; margin: 0 0 16px; padding: 0; display: flex; flex-wrap: wrap; gap: 8px;")} aria-label="Incident stages">
          {stages.map((label, i) => (
            <li key={label} style={s("display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 10px; background: #F7FAF8; border: 1px solid #E3EEE8; font-size: 14px; font-weight: 700;")}>
              <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #067A50;")}>{String(i + 1).padStart(2, "0")}</span>
              {label}
            </li>
          ))}
        </ol>
        {incidents.map((i) => (
          <article key={`${i.title}-${i.time}`} style={s("padding: 18px; border-radius: 14px; border: 1px solid #D9E8E0; margin-bottom: 10px;")}>
            <h3 style={s("margin: 0 0 6px; font-size: 17px;")}>{i.title}</h3>
            <p style={s("margin: 0; font-size: 14px; color: #3A4A52;")}>
              {i.stage} · {i.time} · Affected: {i.components}
            </p>
            <p style={s("margin: 8px 0 0; font-size: 15px;")}>{i.impact}</p>
          </article>
        ))}
        {incidents.length === 0 ? (
          <p style={s("margin: 0; padding: 18px; border-radius: 14px; border: 1px dashed #C9DAD1; font-size: 15px; line-height: 1.6; color: #3A4A52;")}>
            Incident history is not published yet. When it is, each update will show its stage, timestamp, affected components and user impact.
          </p>
        ) : null}
      </section>
    </>
  );
}
