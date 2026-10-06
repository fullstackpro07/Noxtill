"use client";

import { useState } from "react";
import Link from "next/link";
import { s } from "@/components/site/legal/s";
import { jumpTo, tabKeys } from "@/components/site/legal/use-legal";

export interface PrivacyPersona {
  key: string;
  label: string;
  desc: string;
  note: string;
  links: { label: string; id?: string; href?: string }[];
}
export interface PrivacyDataCat {
  key: string;
  title: string;
  role: string;
  items: string[];
}
export interface PrivacyRegion {
  key: string;
  label: string;
  title: string;
  text: string[];
}

export function PrivacyPersonas({ personas }: { personas: PrivacyPersona[] }) {
  const [persona, setPersona] = useState("");
  const cur = personas.find((p) => p.key === persona);
  return (
    <section aria-labelledby="persona-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 12px;")} data-noprint="true">
      <h2 id="persona-h" style={s("margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
        What is your relationship with Noxtill?
      </h2>
      <p style={s("margin: 0 0 20px; font-size: 16px; color: #3A4A52;")}>Choose one to see the parts of this Policy that matter most to you. The full Policy below applies to everyone.</p>
      <div role="radiogroup" aria-labelledby="persona-h" style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px;")}>
        {personas.map((p) => {
          const on = persona === p.key;
          return (
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPersona(on ? "" : p.key)}
              style={s(
                `text-align: left; display: flex; flex-direction: column; gap: 6px; padding: 18px; border-radius: 16px; border: 2px solid ${on ? "#079A63" : "#D9E8E0"}; background: ${on ? "#ECFBF4" : "#FFFFFF"}; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; color: #0B1822; min-height: 120px;`,
              )}
            >
              <span style={s("font-size: 17px; font-weight: 750;")}>{p.label}</span>
              <span style={s("font-size: 14px; line-height: 1.5; color: #3A4A52;")}>{p.desc}</span>
            </button>
          );
        })}
      </div>
      {cur ? (
        <div role="status" style={s("margin-top: 14px; padding: 18px 20px; border-radius: 14px; background: #F7FAF8; border: 1px solid #D9E8E0; display: flex; flex-direction: column; gap: 10px;")}>
          <p style={s("margin: 0; font-size: 15px; line-height: 1.6;")}>
            <strong>Summary for {cur.label.toLowerCase()}.</strong> {cur.note}
          </p>
          <div style={s("display: flex; flex-wrap: wrap; gap: 8px;")}>
            {cur.links.map((l) => {
              const st = s("display: inline-flex; align-items: center; min-height: 36px; padding: 0 12px; border-radius: 999px; background: #FFFFFF; border: 1px solid #BFE8D3; font-size: 14px; font-weight: 600; text-decoration: none; color: #064F3B;");
              return l.href ? (
                <Link key={l.label} href={l.href} style={st}>
                  {l.label}
                </Link>
              ) : (
                <a key={l.label} href={`#${l.id}`} onClick={jumpTo(l.id ?? "")} style={st}>
                  {l.label}
                </a>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function PrivacyDataCats({ cats }: { cats: PrivacyDataCat[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <div style={s("display: flex; flex-direction: column; gap: 8px;")}>
      {cats.map((d) => {
        const o = !!open[d.key];
        return (
          <div key={d.key} style={s("border: 1px solid #D9E8E0; border-radius: 14px; background: #FFFFFF;")}>
            <h3 style={s("margin: 0;")}>
              <button
                type="button"
                id={`dc-${d.key}`}
                aria-expanded={o}
                aria-controls={`dp-${d.key}`}
                onClick={() => setOpen({ ...open, [d.key]: !o })}
                style={s(
                  "width: 100%; min-height: 56px; display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 0; background: transparent; cursor: pointer; text-align: left; font: 700 16px 'Plus Jakarta Sans', sans-serif; color: #0B1822;",
                )}
              >
                <span style={s("flex: 1;")}>{d.title}</span>
                <span style={s("font-size: 13px; font-weight: 600; color: #4C5B63;")}>{d.items.length} categories</span>
                <span aria-hidden="true" style={s("color: #064F3B; width: 16px;")}>
                  {o ? "−" : "+"}
                </span>
              </button>
            </h3>
            <div id={`dp-${d.key}`} role="region" aria-labelledby={`dc-${d.key}`} hidden={!o} data-panel="true" style={s("padding: 0 16px 16px;")}>
              <p style={s("margin: 0 0 10px; font-size: 14px; color: #3A4A52;")}>{d.role}</p>
              <ul style={s("margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px;")}>
                {d.items.map((it) => (
                  <li key={it} style={s("font-size: 14px; padding: 6px 10px; border-radius: 8px; background: #ECFBF4; color: #043F31;")}>
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const RIGHTS = [
  "Access / know",
  "Correct",
  "Delete",
  "Restrict or object",
  "Portability",
  "Withdraw consent",
  "Opt out of sale, sharing, targeted advertising or certain profiling",
  "Limit certain sensitive uses",
  "Appeal a denial",
  "Complain to a regulator",
];

export function PrivacyRights({ regions }: { regions: PrivacyRegion[] }) {
  const [region, setRegion] = useState("us");
  const cur = regions.find((r) => r.key === region) ?? regions[0];
  const keys = regions.map((r) => r.key);
  return (
    <section id="rights" aria-labelledby="rights-h" style={s("max-width: 1240px; margin: 0 auto; padding: 40px 24px 8px; scroll-margin-top: 90px;")}>
      <div style={s("border-radius: 20px; overflow: hidden; border: 1px solid #D9E8E0;")}>
        <div style={s("background: #064F3B; color: #FFFFFF; padding: 22px 22px 0;")}>
          <div style={s("display: flex; flex-wrap: wrap; gap: 10px 24px; align-items: center; justify-content: space-between; margin-bottom: 16px;")}>
            <h2 id="rights-h" style={s("margin: 0; font-size: 22px; font-weight: 800;")}>
              Your privacy rights by region
            </h2>
            <label style={s("display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600;")} data-noprint="true">
              Your region
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                style={s("height: 40px; padding: 0 10px; border-radius: 9px; border: 0; font: 600 14px 'Plus Jakarta Sans', sans-serif; color: #043F31;")}
              >
                {regions.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div role="tablist" aria-label="Privacy rights region" style={s("display: flex; gap: 4px; overflow-x: auto;")} data-noprint="true">
            {regions.map((r) => {
              const on = region === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  role="tab"
                  id={`tab-${r.key}`}
                  aria-selected={on}
                  aria-controls="rights-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => setRegion(r.key)}
                  onKeyDown={(e) => tabKeys(e, keys, region, setRegion)}
                  style={s(
                    `flex-shrink: 0; height: 46px; padding: 0 16px; border: 0; border-radius: 10px 10px 0 0; background: ${on ? "#FFFFFF" : "transparent"}; color: ${on ? "#043F31" : "#FFFFFF"}; font: 700 14px 'Plus Jakarta Sans', sans-serif; cursor: pointer;`,
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
        <div
          id="rights-panel"
          role="tabpanel"
          aria-labelledby={`tab-${region}`}
          style={s("padding: 24px 22px; background: #FFFFFF; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 24px;")}
        >
          <div style={s("display: flex; flex-direction: column; gap: 12px; min-width: 0;")}>
            <h3 style={s("margin: 0; font-size: 18px; font-weight: 750;")}>{cur.title}</h3>
            {cur.text.map((t, i) => (
              <p key={i} style={s("margin: 0; font-size: 16px; line-height: 1.65; color: #24343C;")}>
                {t}
              </p>
            ))}
            <p style={s("margin: 0; font-size: 13px; color: #4C5B63;")}>Selecting a region changes only this supplemental panel. The global Policy below always applies in full.</p>
          </div>
          <div style={s("display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 14px; background: #ECFBF4;")}>
            <h3 style={s("margin: 0; font-size: 16px; font-weight: 750;")}>Rights you may have, depending on jurisdiction</h3>
            <ul style={s("margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 15px; line-height: 1.5;")}>
              {RIGHTS.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div style={s("display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;")} data-noprint="true">
              <Link
                href="/contact#privacy"
                style={s("display: inline-flex; align-items: center; height: 44px; padding: 0 16px; border-radius: 10px; background: #064F3B; color: #FFFFFF; font-weight: 700; font-size: 15px; text-decoration: none;")}
              >
                Submit a privacy request
              </Link>
              <a
                href="mailto:privacy@noxtill.com"
                style={s("display: inline-flex; align-items: center; height: 44px; padding: 0 16px; border-radius: 10px; background: #FFFFFF; color: #064F3B; font-weight: 700; font-size: 15px; text-decoration: none; border: 1px solid #9FD9BD;")}
              >
                Email privacy@noxtill.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
