"use client";

import { useEffect, useState, type ReactNode } from "react";
import { s } from "@/components/site/legal/s";
import { tabKeys } from "@/components/site/legal/use-legal";

const TABS: [string, string, string][] = [
  ["main", "Main DPA", "main-dpa"],
  ["a1", "Annex I · Processing", "annex-i"],
  ["a2", "Annex II · Measures", "annex-ii"],
  ["a3", "Annex III · Subprocessors", "annex-iii"],
  ["tr", "International transfers", "transfers"],
];
const HASH_TO_TAB: Record<string, string> = { "annex-i": "a1", "annex-ii": "a2", "annex-iii": "a3", transfers: "tr" };

/** Sticky tab bar + panels; each panel is server-rendered and shown/hidden here (all stay in the DOM for print). */
export function DpaTabs({ panels }: { panels: Record<string, ReactNode> }) {
  const [tab, setTab] = useState("main");
  useEffect(() => {
    const t = HASH_TO_TAB[window.location.hash.slice(1)];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL hash is unavailable during SSR, so it can only be read post-mount
    if (t) setTab(t);
  }, []);
  const keys = TABS.map((t) => t[0]);
  const panelStyle = s("scroll-margin-top: 130px; max-width: 980px;");
  return (
    <>
      <div style={s("position: sticky; top: 72px; z-index: 20; background: rgba(255,255,255,0.97); border-bottom: 1px solid #E3EEE8;")} data-noprint="true">
        <div role="tablist" aria-label="DPA documents" style={s("max-width: 1240px; margin: 0 auto; padding: 0 24px; display: flex; gap: 4px; overflow-x: auto;")}>
          {TABS.map(([k, label, panel]) => {
            const on = tab === k;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                id={`tab-${k}`}
                aria-selected={on}
                aria-controls={panel}
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(k)}
                onKeyDown={(e) => tabKeys(e, keys, tab, setTab)}
                style={s(
                  `flex-shrink: 0; height: 54px; padding: 0 16px; border: 0; border-bottom: 3px solid ${on ? "#079A63" : "transparent"}; background: transparent; color: ${on ? "#043F31" : "#4C5B63"}; font: 700 15px 'Plus Jakarta Sans', sans-serif; cursor: pointer;`,
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={s("max-width: 1240px; margin: 0 auto; padding: 32px 24px 64px;")}>
        {TABS.map(([k, , panel]) => (
          <section key={k} id={panel} role="tabpanel" aria-labelledby={`tab-${k}`} hidden={tab !== k} data-panel="true" style={k === "main" ? s("scroll-margin-top: 130px;") : panelStyle}>
            {panels[k]}
          </section>
        ))}
      </div>
    </>
  );
}
