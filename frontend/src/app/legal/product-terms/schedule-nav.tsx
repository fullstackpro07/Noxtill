"use client";

import { useEffect, useState } from "react";
import { s } from "@/components/site/legal/s";
import { jump, jumpTo, useNarrow, useScrollSpy } from "@/components/site/legal/use-legal";

export function ScheduleFinder({ modules }: { modules: { n: number; name: string; schedule: string; scheduleNum: number }[] }) {
  const [q, setQ] = useState("");
  const qq = q.trim().toLowerCase();
  const finder = qq ? modules.filter((m) => m.name.toLowerCase().includes(qq) || (qq.includes("whatsapp") && m.n === 25) || (qq.includes("pos") && m.n === 2)).slice(0, 8) : [];
  return (
    <>
      <div style={s("display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: end; justify-content: space-between; margin-bottom: 16px;")}>
        <h2 id="sched-h" style={s("margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
          Product Schedules
        </h2>
        <label style={s("display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 700; flex: 0 1 320px;")}>
          Which schedule covers a module?
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Payroll, WhatsApp, POS"
            style={s("height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid #CFDDD5; font: 500 15px 'Plus Jakarta Sans', sans-serif;")}
          />
        </label>
      </div>
      {qq ? (
        <ul role="status" style={s("list-style: none; margin: 0 0 16px; padding: 0; display: flex; flex-wrap: wrap; gap: 8px;")}>
          {finder.map((f) => (
            <li key={f.n}>
              <a
                href={`#${f.schedule}`}
                onClick={jumpTo(f.schedule)}
                style={s("display: inline-flex; gap: 8px; align-items: center; min-height: 40px; padding: 0 14px; border-radius: 999px; background: #043F31; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 700;")}
              >
                {f.name} <span style={s("color: #44F0B0;")}>→ Schedule {f.scheduleNum}</span>
              </a>
            </li>
          ))}
          {finder.length === 0 ? <li style={s("font-size: 14px; color: #4C5B63;")}>No module matches “{q}”.</li> : null}
        </ul>
      ) : null}
    </>
  );
}

export function ScheduleNav({ items }: { items: { key: string; n: number; short: string }[] }) {
  const narrow = useNarrow(980);
  const active = useScrollSpy(items.map((i) => i.key));
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h && document.getElementById(h)) setTimeout(() => jump(h), 300);
  }, []);
  if (narrow) return null;
  return (
    <nav aria-label="Schedules" style={s("flex: 0 0 250px; position: sticky; top: 122px; max-height: calc(100vh - 140px); overflow: auto;")} data-noprint="true">
      <p style={s("margin: 0 0 10px; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #4C5B63;")}>Schedules</p>
      <ol style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px;")}>
        {items.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key}>
              <a
                href={`#${t.key}`}
                onClick={jumpTo(t.key)}
                aria-current={on ? "true" : undefined}
                className="h-mint"
                style={s(
                  `display: flex; gap: 10px; padding: 8px 10px; border-radius: 8px; font-size: 14px; line-height: 1.35; text-decoration: none; color: ${on ? "#043F31" : "#3A4A52"}; background: ${on ? "#ECFBF4" : "transparent"}; font-weight: ${on ? 700 : 500};`,
                )}
              >
                <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #067A50; padding-top: 1px;")}>{t.n}</span>
                {t.short}
              </a>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => window.print()}
        style={s("margin-top: 16px; width: 100%; height: 42px; border-radius: 10px; border: 1px solid #CFDDD5; background: #FFFFFF; color: #064F3B; font: 700 14px 'Plus Jakarta Sans', sans-serif; cursor: pointer;")}
      >
        Print / Save as PDF
      </button>
    </nav>
  );
}
