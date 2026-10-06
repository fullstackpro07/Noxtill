"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { s } from "@/components/site/legal/s";
import { jump } from "@/components/site/legal/use-legal";

export interface LegalModule {
  id: string;
  n: number;
  name: string;
  scope: string;
  position: string;
  treatment: string;
  keys: string[];
}

export function ModuleMap({ modules, labels, routes }: { modules: LegalModule[]; labels: Record<string, string>; routes: Record<string, string> }) {
  const [policy, setPolicy] = useState("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h.startsWith("module-")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL hash is unavailable during SSR, so it can only be read post-mount
      setOpen({ [h]: true });
      setTimeout(() => jump(h), 250);
    }
  }, []);
  const shown = modules.filter((m) => policy === "all" || m.keys.includes(policy));
  return (
    <section id="modules" aria-labelledby="mod-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 12px; scroll-margin-top: 90px;")}>
      <div style={s("display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: end; justify-content: space-between; margin-bottom: 16px;")}>
        <div>
          <h2 id="mod-h" style={s("margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
            Legal map of the 40 Noxtill modules
          </h2>
          <p style={s("margin: 0; font-size: 15px; color: #3A4A52; max-width: 72ch;")}>Which policies govern each module, and the module’s legal position. Filter by policy.</p>
        </div>
        <label style={s("display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 700;")} data-noprint="true">
          Policy
          <select value={policy} onChange={(e) => setPolicy(e.target.value)} style={s("height: 44px; padding: 0 10px; border-radius: 10px; border: 1px solid #CFDDD5; font: 500 15px 'Plus Jakarta Sans', sans-serif;")}>
            <option value="all">All policies</option>
            {Object.keys(labels).map((k) => (
              <option key={k} value={k}>
                {labels[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p style={s("margin: 0 0 10px; font-size: 14px; color: #4C5B63;")} aria-live="polite">
        Showing {shown.length} of 40 modules
      </p>
      <div style={s("display: flex; flex-direction: column; gap: 8px;")}>
        {shown.map((m) => {
          const o = !!open[m.id];
          return (
            <div key={m.id} id={m.id} style={s("border: 1px solid #D9E8E0; border-radius: 14px; background: #FFFFFF; scroll-margin-top: 96px;")}>
              <h3 style={s("margin: 0;")}>
                <button
                  type="button"
                  id={`${m.id}-b`}
                  aria-expanded={o}
                  aria-controls={`${m.id}-p`}
                  onClick={() => setOpen({ ...open, [m.id]: !o })}
                  style={s(
                    "width: 100%; min-height: 56px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 14px 18px; border: 0; background: transparent; text-align: left; cursor: pointer; font: 700 16px 'Plus Jakarta Sans', sans-serif; color: #0B1822;",
                  )}
                >
                  <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #067A50; min-width: 26px;")}>{String(m.n).padStart(2, "0")}</span>
                  <span style={s("flex: 1 1 200px;")}>{m.name}</span>
                  <span style={s("display: flex; flex-wrap: wrap; gap: 4px;")}>
                    {m.keys.map((k) => (
                      <span key={k} style={s("font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 6px; background: #ECFBF4; color: #043F31;")}>
                        {labels[k]}
                      </span>
                    ))}
                  </span>
                  <span aria-hidden="true" style={s("color: #064F3B; width: 16px;")}>
                    {o ? "−" : "+"}
                  </span>
                </button>
              </h3>
              <div id={`${m.id}-p`} role="region" aria-labelledby={`${m.id}-b`} hidden={!o} data-panel="true" style={s("padding: 0 18px 18px 58px; font-size: 15px; line-height: 1.65; color: #24343C;")}>
                <p style={s("margin: 0 0 8px;")}>
                  <strong>Functional scope.</strong> {m.scope}
                </p>
                <p style={s("margin: 0 0 8px;")}>
                  <strong>Legal position.</strong> {m.position}
                </p>
                <p style={s("margin: 0 0 12px;")}>
                  <strong>Main legal treatment.</strong> {m.treatment}
                </p>
                <div style={s("display: flex; flex-wrap: wrap; gap: 8px;")}>
                  {m.keys.map((k) => (
                    <Link
                      key={k}
                      href={routes[k]}
                      style={s("display: inline-flex; align-items: center; min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid #BFE8D3; font-size: 14px; font-weight: 600; text-decoration: none;")}
                    >
                      {labels[k]}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
