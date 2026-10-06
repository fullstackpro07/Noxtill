"use client";

import { useState } from "react";
import { s } from "@/components/site/legal/s";

const TIER_NAMES = ["Draft-only", "Recommendation", "Bounded execution", "High-impact"];
export const TIER_COLORS = ["#079A63", "#00C99D", "#B7791F", "#8A2A1E"];

/** Default-authority text → approval-ladder tier, as the design classifies the AI register. */
const tierOf = (a: string) => (/bounded|execution only/i.test(a) ? 2 : /^Recommend/.test(a) ? 1 : 0);

export function AiSystemMap({ rows }: { rows: string[][] }) {
  const [sel, setSel] = useState(0);
  const r = rows[sel];
  const curT = tierOf(r[3]);
  const dt = s("font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #44F0B0;");
  const dd = s("margin: 2px 0 0;");
  const listKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel(Math.min(rows.length - 1, sel + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel(Math.max(0, sel - 1));
    } else if (e.key === "Home") setSel(0);
    else if (e.key === "End") setSel(rows.length - 1);
  };
  return (
    <section id="ai-map" aria-labelledby="map-h" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px; scroll-margin-top: 90px;")}>
      <h2 id="map-h" style={s("margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
        AI system map
      </h2>
      <p style={s("margin: 0 0 20px; font-size: 15px; color: #3A4A52; max-width: 72ch;")}>
        Where AI appears in Noxtill, what context it uses and its designed default authority. Select a surface to see where it sits on the approval ladder.
      </p>
      <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 20px; align-items: start;")}>
        <div role="listbox" aria-label="AI surfaces" aria-activedescendant={`ais-${sel}`} tabIndex={0} onKeyDown={listKey} style={s("display: flex; flex-direction: column; gap: 6px; outline-offset: 4px;")}>
          {rows.map((row, i) => {
            const t = tierOf(row[3]);
            const on = sel === i;
            return (
              <div
                key={row[0]}
                role="option"
                id={`ais-${i}`}
                aria-selected={on}
                onClick={() => setSel(i)}
                style={s(
                  `display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-radius: 12px; border: 1px solid ${on ? "#079A63" : "#E3EEE8"}; background: ${on ? "#ECFBF4" : "#FFFFFF"}; cursor: pointer; min-height: 48px; box-sizing: border-box;`,
                )}
              >
                <span aria-hidden="true" style={s(`width: 10px; height: 10px; border-radius: 50%; background: ${TIER_COLORS[t]}; flex-shrink: 0;`)} />
                <span style={s("flex: 1; font-size: 15px; font-weight: 700; color: #0B1822;")}>{row[0]}</span>
                <span style={s("font-size: 12px; font-weight: 700; color: #3A4A52;")}>{TIER_NAMES[t]}</span>
              </div>
            );
          })}
        </div>
        <div style={s("position: sticky; top: 122px; display: flex; flex-direction: column; gap: 14px;")}>
          <div aria-live="polite" style={s("padding: 22px; border-radius: 18px; background: #043F31; color: #FFFFFF; display: flex; flex-direction: column; gap: 14px;")}>
            <h3 style={s("margin: 0; font-size: 21px; font-weight: 800;")}>{r[0]}</h3>
            <dl style={s("margin: 0; display: grid; grid-template-columns: 1fr; gap: 12px; font-size: 15px; line-height: 1.5;")}>
              {(
                [
                  ["Function", r[1]],
                  ["Data context", r[2]],
                  ["Default authority", r[3]],
                  ["Human / legal safeguard", r[4]],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt style={dt}>{k}</dt>
                  <dd style={dd}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ol aria-label="Approval ladder" style={s("list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px;")}>
            {TIER_NAMES.map((t, i) => {
              const on = i === curT;
              return (
                <li
                  key={t}
                  aria-current={on ? "step" : undefined}
                  style={s(
                    `padding: 12px 10px; border-radius: 12px; background: ${on ? TIER_COLORS[i] : "#FFFFFF"}; color: ${on ? "#FFFFFF" : "#24343C"}; border: 2px solid ${on ? TIER_COLORS[i] : "#E3EEE8"}; display: flex; flex-direction: column; gap: 4px; min-height: 84px;`,
                  )}
                >
                  <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600;")}>T{i + 1}</span>
                  <span style={s("font-size: 13px; font-weight: 800; line-height: 1.25;")}>{t}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
