"use client";

import { useState } from "react";
import { s } from "@/components/site/legal/s";
import { jumpTo, tabKeys } from "@/components/site/legal/use-legal";

export interface Channel {
  key: string;
  label: string;
  text: string[];
  quote?: string;
  listTitle: string;
  list: string[];
  refLabel: string;
  refId: string;
}

export function ChannelTabs({ channels }: { channels: Channel[] }) {
  const [ch, setCh] = useState(channels[0].key);
  const c = channels.find((x) => x.key === ch) ?? channels[0];
  const keys = channels.map((x) => x.key);
  return (
    <section id="channels" aria-labelledby="ch-h" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px; scroll-margin-top: 90px;")}>
      <h2 id="ch-h" style={s("margin: 0 0 16px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
        Channel rules
      </h2>
      <div style={s("border: 1px solid #D9E8E0; border-radius: 20px; overflow: hidden;")}>
        <div role="tablist" aria-label="Messaging channel" style={s("display: flex; overflow-x: auto; background: #F7FAF8; border-bottom: 1px solid #D9E8E0;")} data-noprint="true">
          {channels.map((t) => {
            const on = ch === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={on}
                aria-controls="ch-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => setCh(t.key)}
                onKeyDown={(e) => tabKeys(e, keys, ch, setCh)}
                style={s(
                  `flex: 1 0 auto; min-width: 120px; height: 56px; padding: 0 18px; border: 0; border-bottom: 3px solid ${on ? "#079A63" : "transparent"}; background: ${on ? "#FFFFFF" : "transparent"}; color: ${on ? "#043F31" : "#3A4A52"}; font: 700 15px 'Plus Jakarta Sans', sans-serif; cursor: pointer;`,
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div id="ch-panel" role="tabpanel" aria-labelledby={`tab-${ch}`} style={s("padding: 26px 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 28px;")}>
          <div style={s("display: flex; flex-direction: column; gap: 12px; min-width: 0;")}>
            <h3 style={s("margin: 0; font-size: 19px; font-weight: 800;")}>{c.label}</h3>
            {c.text.map((p, i) => (
              <p key={i} style={s("margin: 0; font-size: 16px; line-height: 1.65;")}>
                {p}
              </p>
            ))}
            {c.quote ? (
              <blockquote style={s("margin: 0; padding: 16px 18px; border-radius: 12px; background: #ECFBF4; font-size: 16px; line-height: 1.55; font-weight: 600; color: #043F31;")}>{c.quote}</blockquote>
            ) : null}
            <a href={`#${c.refId}`} onClick={jumpTo(c.refId)} style={s("font-size: 14px; font-weight: 700;")}>
              Read {c.refLabel} in full
            </a>
          </div>
          <div style={s("display: flex; flex-direction: column; gap: 10px; padding: 20px; border-radius: 16px; background: #F7FAF8; border: 1px solid #E3EEE8;")}>
            <h3 style={s("margin: 0; font-size: 15px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #064F3B;")}>{c.listTitle}</h3>
            <ul style={s("margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; font-size: 15px; line-height: 1.5;")}>
              {c.list.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
