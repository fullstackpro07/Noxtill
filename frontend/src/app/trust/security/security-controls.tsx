"use client";

import { useEffect, useState } from "react";
import { s } from "@/components/site/legal/s";
import { jump } from "@/components/site/legal/use-legal";
import type { VisibleSection } from "@/lib/marketing/legal/nox";

export interface ControlFamily {
  code: string;
  name: string;
  items: VisibleSection[];
}

export function SecurityControls({ families }: { families: ControlFamily[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [all, setAll] = useState(false);
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h.startsWith("s-")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL hash is unavailable during SSR, so it can only be read post-mount
      setOpen({ [h]: true });
      setTimeout(() => jump(h), 200);
    }
  }, []);
  const allIds = families.flatMap((f) => f.items.map((i) => i.id));
  const toggle = (id: string, isOpen: boolean) => {
    const base = all ? Object.fromEntries(allIds.map((x) => [x, true])) : open;
    setAll(false);
    setOpen({ ...base, [id]: !isOpen });
  };
  return (
    <section id="controls" aria-labelledby="ctl-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 12px; scroll-margin-top: 90px;")}>
      <div style={s("display: flex; flex-wrap: wrap; gap: 10px 24px; align-items: center; justify-content: space-between; margin-bottom: 18px;")}>
        <h2 id="ctl-h" style={s("margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
          Security controls
        </h2>
        <button
          type="button"
          onClick={() => {
            setAll(!all);
            setOpen({});
          }}
          aria-pressed={all}
          style={s("height: 42px; padding: 0 16px; border-radius: 10px; border: 1px solid #CFDDD5; background: #FFFFFF; color: #064F3B; font: 700 14px 'Plus Jakarta Sans', sans-serif; cursor: pointer;")}
          data-noprint="true"
        >
          {all ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <div style={s("display: flex; flex-direction: column; gap: 28px;")}>
        {families.map((f) => (
          <div key={f.code} style={s("display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: flex-start;")}>
            <div style={s("flex: 1 1 200px; display: flex; flex-direction: column; gap: 6px;")}>
              <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; color: #067A50;")}>{f.code}</span>
              <h3 style={s("margin: 0; font-size: 20px; font-weight: 800;")}>{f.name}</h3>
            </div>
            <div style={s("flex: 3 1 520px; display: flex; flex-direction: column; gap: 8px; min-width: 0;")}>
              {f.items.map((c) => {
                const o = all || !!open[c.id];
                return (
                  <div key={c.id} id={c.id} style={s("border: 1px solid #D9E8E0; border-radius: 14px; background: #FFFFFF; scroll-margin-top: 96px;")}>
                    <h4 style={s("margin: 0;")}>
                      <button
                        type="button"
                        id={`${c.id}-b`}
                        aria-expanded={o}
                        aria-controls={`${c.id}-p`}
                        onClick={() => toggle(c.id, o)}
                        style={s(
                          "width: 100%; min-height: 56px; display: flex; align-items: center; gap: 12px; padding: 14px 18px; border: 0; background: transparent; text-align: left; cursor: pointer; font: 700 16px 'Plus Jakarta Sans', sans-serif; color: #0B1822;",
                        )}
                      >
                        <span style={s("flex: 1;")}>{c.title}</span>
                        <span aria-hidden="true" style={s("color: #064F3B; width: 16px;")}>
                          {o ? "−" : "+"}
                        </span>
                      </button>
                    </h4>
                    <div id={`${c.id}-p`} role="region" aria-labelledby={`${c.id}-b`} hidden={!o} data-panel="true" style={s("padding: 0 18px 16px;")}>
                      {c.blocks.map((b, i) =>
                        b.isNote ? (
                          <p key={i} style={s("margin: 0 0 10px; font-size: 14px; line-height: 1.6; color: #4C5B63; padding: 10px 14px; border: 1px dashed #C9DAD1; border-radius: 10px;")}>
                            {b.x}
                          </p>
                        ) : b.isP ? (
                          <p key={i} style={s("margin: 0 0 10px; font-size: 16px; line-height: 1.65; color: #24343C;")}>
                            {b.x}
                          </p>
                        ) : null,
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
