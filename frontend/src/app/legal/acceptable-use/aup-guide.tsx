"use client";

import { useState } from "react";
import { s } from "@/components/site/legal/s";

export interface AupItem {
  text: string;
  topic: string;
  src: string;
}

const TOPICS = ["All", "Messaging", "AI", "Commerce", "Security", "Content", "Reviews", "APIs"];

export function AupGuide({ allowed, restricted, prohibited }: { allowed: AupItem[]; restricted: AupItem[]; prohibited: AupItem[] }) {
  const [topic, setTopic] = useState("All");
  const f = (arr: AupItem[]) => arr.filter((i) => topic === "All" || i.topic === topic);
  const columns = (
    [
      ["Allowed", "✓", allowed, "#DDF6EA", "#04573C", "#079A63", "#BFE8D3"],
      ["Restricted / needs approval", "!", restricted, "#FFF1D6", "#6E4400", "#B7791F", "#F2D49B"],
      ["Prohibited", "✕", prohibited, "#FDE7E4", "#8A2A1E", "#B4362A", "#F2C3BC"],
    ] as const
  ).map(([title, icon, arr, head, fg, dot, bd]) => ({ title, icon, items: f(arr), head, fg, dot, bd }));

  return (
    <section aria-labelledby="guide-h" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px;")}>
      <div style={s("display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: end; justify-content: space-between; margin-bottom: 18px;")}>
        <div>
          <h2 id="guide-h" style={s("margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
            Allowed, restricted, prohibited
          </h2>
          <p style={s("margin: 0; font-size: 14px; color: #4C5B63; max-width: 70ch;")}>
            <strong style={s("color: #0B1822;")}>Summary guide.</strong> Each item cites its source. The binding list is §7.3 below; Noxtill may prohibit, restrict or require approval for any use listed there.
          </p>
        </div>
        <div role="group" aria-label="Filter by topic" style={s("display: flex; flex-wrap: wrap; gap: 6px;")} data-noprint="true">
          {TOPICS.map((t) => {
            const on = topic === t;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setTopic(t)}
                style={s(
                  `height: 40px; padding: 0 14px; border-radius: 999px; border: 1px solid ${on ? "#064F3B" : "#CFDDD5"}; background: ${on ? "#064F3B" : "#FFFFFF"}; color: ${on ? "#FFFFFF" : "#24343C"}; font: 700 14px 'Plus Jakarta Sans', sans-serif; cursor: pointer;`,
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>
      <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 16px; align-items: start;")}>
        {columns.map((c) => (
          <div key={c.title} style={s(`border-radius: 18px; border: 1px solid ${c.bd}; background: #FFFFFF; overflow: hidden;`)}>
            <div style={s(`padding: 16px 18px; background: ${c.head}; display: flex; align-items: center; gap: 10px;`)}>
              <span
                aria-hidden="true"
                style={s(`width: 30px; height: 30px; border-radius: 50%; background: ${c.dot}; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px;`)}
              >
                {c.icon}
              </span>
              <h3 style={s(`margin: 0; font-size: 18px; font-weight: 800; color: ${c.fg};`)}>{c.title}</h3>
              <span style={s(`margin-left: auto; font-size: 13px; font-weight: 700; color: ${c.fg};`)}>{c.items.length} items</span>
            </div>
            <ul style={s("list-style: none; margin: 0; padding: 6px 0;")}>
              {c.items.map((i) => (
                <li key={i.text} style={s("padding: 12px 18px; border-top: 1px solid #EEF4F1; display: flex; flex-direction: column; gap: 6px;")}>
                  <span style={s("font-size: 15px; line-height: 1.5; color: #0B1822;")}>{i.text}</span>
                  <span style={s("display: flex; gap: 8px; flex-wrap: wrap; font-size: 12px; font-weight: 700;")}>
                    <span style={s("padding: 2px 8px; border-radius: 6px; background: #F1F5F3; color: #3A4A52;")}>{i.topic}</span>
                    <span style={s("color: #4C5B63;")}>{i.src}</span>
                  </span>
                </li>
              ))}
              {c.items.length === 0 ? <li style={s("padding: 14px 18px; font-size: 14px; color: #4C5B63;")}>No items for this topic.</li> : null}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
