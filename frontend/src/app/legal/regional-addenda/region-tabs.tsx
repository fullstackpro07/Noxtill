"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { s } from "@/components/site/legal/s";
import { tabKeys } from "@/components/site/legal/use-legal";
import type { NoxRegion } from "@/lib/marketing/legal/nox";

const ORDER = ["Global", "Americas", "Europe", "Asia-Pacific"];

export function RegionTabs({ regions }: { regions: NoxRegion[] }) {
  const [sel, setSel] = useState("global");
  useEffect(() => {
    const h = window.location.hash.replace("#region-", "");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL hash is unavailable during SSR, so it can only be read post-mount
    if (h && h !== window.location.hash && regions.some((r) => r.key === h)) setSel(h);
  }, [regions]);
  const pick = (k: string) => {
    setSel(k);
    try {
      history.replaceState(null, "", `#region-${k}`);
    } catch {
      /* history unavailable (sandboxed frame) — selection still applies */
    }
  };
  const keys = regions.map((r) => r.key);
  const groups = ORDER.map((g) => ({ name: g, items: regions.filter((r) => r.group === g) })).filter((g) => g.items.length);
  return (
    <section aria-label="Regional addenda" style={s("max-width: 1240px; margin: 0 auto; padding: 40px 24px 12px; display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start;")}>
      <nav aria-label="Jurisdictions" style={s("flex: 1 1 240px; max-width: 300px; position: sticky; top: 122px;")} data-noprint="true">
        <div role="tablist" aria-orientation="vertical" aria-label="Jurisdiction" style={s("display: flex; flex-direction: column; gap: 14px;")}>
          {groups.map((g) => (
            <div key={g.name} style={s("display: flex; flex-direction: column; gap: 2px;")}>
              <span style={s("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #4C5B63; padding: 0 12px 4px;")}>{g.name}</span>
              {g.items.map((r) => {
                const on = sel === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    role="tab"
                    id={`tab-${r.key}`}
                    aria-selected={on}
                    aria-controls={`region-${r.key}`}
                    tabIndex={on ? 0 : -1}
                    onClick={() => pick(r.key)}
                    onKeyDown={(e) => tabKeys(e, keys, sel, pick)}
                    style={s(
                      `display: flex; justify-content: space-between; align-items: center; gap: 8px; text-align: left; min-height: 44px; padding: 0 12px; border: 0; border-left: 3px solid ${on ? "#079A63" : "transparent"}; background: ${on ? "#ECFBF4" : "transparent"}; color: #0B1822; font: ${on ? 700 : 500} 15px 'Plus Jakarta Sans', sans-serif; cursor: pointer; border-radius: 0 8px 8px 0;`,
                    )}
                  >
                    {r.name}
                    {r.status === "partial" ? <span style={s("font-size: 11px; font-weight: 700; color: #4C5B63;")}>Partial</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
      <div style={s("flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 40px;")}>
        {regions.map((r) => (
          <article key={r.key} id={`region-${r.key}`} role="tabpanel" aria-labelledby={`tab-${r.key}`} hidden={sel !== r.key} data-panel="true" style={s("scroll-margin-top: 120px;")}>
            <div style={s("display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 16px; margin-bottom: 6px;")}>
              <h2 style={s("margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>{r.name}</h2>
              <span style={s("font-size: 13px; font-weight: 700; color: #4C5B63;")}>{r.group}</span>
            </div>
            <p style={s("margin: 0 0 18px; font-size: 14px; line-height: 1.6; color: #3A4A52;")}>
              {r.key === "global"
                ? "The baseline that applies everywhere. Regional entries below add to it; they never remove a protection."
                : `Applies in addition to the global baseline if this law applies to your use of Noxtill. Where local law gives you greater protection, that protection controls.${r.status === "partial" ? " Only the items below are published for this jurisdiction so far." : ""}`}
            </p>
            <div style={s("display: flex; flex-direction: column; gap: 0; border-top: 1px solid #D9E8E0;")}>
              {r.items.map((i) => (
                <div key={i.topic} style={s("display: flex; flex-wrap: wrap; gap: 6px 28px; padding: 18px 2px; border-bottom: 1px solid #E3EEE8;")}>
                  <h3 style={s("margin: 0; flex: 1 1 200px; font-size: 16px; font-weight: 800;")}>{i.topic}</h3>
                  <div style={s("flex: 3 1 420px; min-width: 0;")}>
                    <p style={s("margin: 0 0 6px; font-size: 16px; line-height: 1.65; color: #24343C;")}>{i.text}</p>
                    <Link href={i.href} style={s("font-size: 13px; font-weight: 700;")}>
                      Source: {i.ref}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
