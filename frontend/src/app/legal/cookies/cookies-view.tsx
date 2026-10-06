"use client";

import { useEffect, useState } from "react";
import { s } from "@/components/site/legal/s";
import { jump, tabKeys } from "@/components/site/legal/use-legal";
import { browserConsentId, recordConsent } from "@/lib/legal-public-api";
import type { CookieRow } from "@/lib/marketing/legal/nox";

type Prefs = { functional: boolean; analytics: boolean; advertising: boolean };
const OFF: Prefs = { functional: false, analytics: false, advertising: false };
const PREFS_KEY = "nox_cookie_prefs";

export interface CookieCategoryText {
  necessary: string;
  functional: string;
  analytics: string;
  advertising: string;
}
export interface CookieRegion {
  key: string;
  label: string;
  title: string;
  text: string;
}

function manage() {
  jump("preferences");
  setTimeout(() => document.getElementById("pref-h")?.focus(), 300);
}

export function ManageCookiesButton() {
  return (
    <button
      type="button"
      onClick={manage}
      className="h-deep"
      style={s("height: 50px; padding: 0 24px; border-radius: 12px; border: 0; background: #064F3B; color: #FFFFFF; font: 800 16px 'Plus Jakarta Sans', sans-serif; cursor: pointer;")}
      data-noprint="true"
    >
      Manage cookies
    </button>
  );
}

/** Preference center + region tabs share the selected region (it is stored with each consent record). */
export function CookieChoices({ texts, regions, policyVersion }: { texts: CookieCategoryText; regions: CookieRegion[]; policyVersion: string }) {
  const [prefs, setPrefs] = useState<Prefs>(OFF);
  const [gpc, setGpc] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [region, setRegion] = useState("eea");

  useEffect(() => {
    const signal = !!(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
    let saved: { categories: Prefs; timestamp: string } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    } catch {
      saved = null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- saved choices live in localStorage/navigator, unavailable during SSR
    setGpc(signal);
    if (saved?.categories) setPrefs({ ...OFF, ...saved.categories });
    setSaveMsg(saved ? `Current choices saved on this device on ${new Date(saved.timestamp).toLocaleString()}.` : "No choices saved yet — non-essential categories are off.");
    if (window.location.hash === "#preferences") setTimeout(manage, 300);
  }, []);

  const persist = (input: Prefs) => {
    const categories = gpc ? { ...input, advertising: false } : input;
    const timestamp = new Date().toISOString();
    const consentId = browserConsentId();
    const rec = { consent_id: consentId, region, timestamp, policy_version: policyVersion, categories, language: navigator.language, source: "cookie-policy-preference-center" };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(rec));
    } catch {
      setSaveMsg("Your browser blocked saving preferences. Your choices apply to this page only.");
      return;
    }
    setPrefs(categories);
    const savedAt = new Date(timestamp).toLocaleTimeString();
    setSaveMsg(`Saved on this device at ${savedAt}. Server-side consent record: syncing…`);
    recordConsent({
      consentId,
      kind: "cookie_preferences",
      region,
      policyVersion,
      categories: { necessary: true, ...categories },
      language: navigator.language,
      source: "cookie-policy-preference-center",
      gpc,
    })
      .then(() => setSaveMsg(`Saved on this device and recorded by Noxtill at ${new Date().toLocaleTimeString()}.`))
      .catch(() => setSaveMsg(`Saved on this device at ${savedAt}. The server-side consent record could not be confirmed, so no server record has been created. Your choice still applies on this device.`));
  };

  const defs: [keyof CookieCategoryText, string][] = [
    ["necessary", "Strictly necessary"],
    ["functional", "Functional"],
    ["analytics", "Analytics"],
    ["advertising", "Advertising/targeting"],
  ];
  const keys = regions.map((r) => r.key);
  const cur = regions.find((r) => r.key === region) ?? regions[0];
  const outline = "height: 46px; padding: 0 20px; border-radius: 11px; border: 1px solid #064F3B; background: #FFFFFF; color: #064F3B; font: 700 15px 'Plus Jakarta Sans', sans-serif; cursor: pointer;";

  return (
    <>
      <section id="preferences" aria-labelledby="pref-h" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px; scroll-margin-top: 90px;")} data-noprint="true">
        <div style={s("border: 1px solid #D9E8E0; border-radius: 20px; overflow: hidden;")}>
          <div style={s("padding: 22px 24px; background: #043F31; color: #FFFFFF; display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; justify-content: space-between;")}>
            <div>
              <h2 id="pref-h" tabIndex={-1} style={s("margin: 0; font-size: 22px; font-weight: 800; outline: none;")}>
                Cookie preferences
              </h2>
              <p style={s("margin: 4px 0 0; font-size: 14px; color: #D7EFE5;")}>Non-essential categories stay off until you allow them where prior consent is required.</p>
            </div>
            {gpc ? (
              <span role="status" style={s("font-size: 13px; font-weight: 700; padding: 8px 12px; border-radius: 9px; background: #44F0B0; color: #043F31;")}>
                Global Privacy Control signal detected — advertising/targeting stays off
              </span>
            ) : null}
          </div>
          <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 0;")}>
            {defs.map(([k, title]) => {
              const locked = k === "necessary" || (k === "advertising" && gpc);
              const on = k === "necessary" ? true : !!prefs[k as keyof Prefs] && !(k === "advertising" && gpc);
              const state = k === "necessary" ? "Always on" : k === "advertising" && gpc ? "Off — GPC honored" : on ? "Allowed" : "Off";
              return (
                <div key={k} style={s("padding: 22px 24px; border-right: 1px solid #E3EEE8; border-bottom: 1px solid #E3EEE8; display: flex; flex-direction: column; gap: 10px; background: #FFFFFF;")}>
                  <div style={s("display: flex; align-items: center; justify-content: space-between; gap: 12px;")}>
                    <h3 id={`cat-${k}`} style={s("margin: 0; font-size: 17px; font-weight: 750;")}>
                      {title}
                    </h3>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-labelledby={`cat-${k}`}
                      aria-disabled={locked}
                      onClick={() => {
                        if (!locked) setPrefs({ ...prefs, [k]: !prefs[k as keyof Prefs] });
                      }}
                      style={s(
                        `position: relative; width: 52px; height: 30px; border-radius: 999px; border: 0; background: ${on ? "#079A63" : "#9FB3AA"}; cursor: ${locked ? "not-allowed" : "pointer"}; flex-shrink: 0; padding: 0;`,
                      )}
                    >
                      <span
                        style={s(
                          `position: absolute; top: 3px; left: ${on ? "25px" : "3px"}; width: 24px; height: 24px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: left .15s;`,
                        )}
                      />
                    </button>
                  </div>
                  <span style={s(`font-size: 13px; font-weight: 700; color: ${on ? "#04573C" : "#4C5B63"};`)}>{state}</span>
                  <p style={s("margin: 0; font-size: 15px; line-height: 1.55; color: #24343C;")}>{texts[k]}</p>
                </div>
              );
            })}
          </div>
          <div style={s("padding: 18px 24px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; background: #F7FAF8;")}>
            <button type="button" onClick={() => persist(OFF)} style={s(outline)}>
              Reject non-essential
            </button>
            <button type="button" onClick={() => persist({ functional: true, analytics: true, advertising: true })} style={s(outline)}>
              Accept all
            </button>
            <button
              type="button"
              onClick={() => persist(prefs)}
              style={s("height: 46px; padding: 0 20px; border-radius: 11px; border: 0; background: #064F3B; color: #FFFFFF; font: 700 15px 'Plus Jakarta Sans', sans-serif; cursor: pointer;")}
            >
              Save my choices
            </button>
            <p role="status" aria-live="polite" style={s("margin: 0; flex: 1 1 280px; font-size: 14px; line-height: 1.5; color: #24343C;")}>
              {saveMsg}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="region-h" style={s("max-width: 1240px; margin: 0 auto; padding: 40px 24px 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 24px;")}>
        <div>
          <h2 id="region-h" style={s("margin: 0 0 14px; font-size: 22px; font-weight: 800;")}>
            How choices work in your region
          </h2>
          <div role="tablist" aria-label="Region" style={s("display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px;")} data-noprint="true">
            {regions.map((r) => {
              const on = region === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  role="tab"
                  id={`tab-${r.key}`}
                  aria-selected={on}
                  aria-controls="ck-region-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => setRegion(r.key)}
                  onKeyDown={(e) => tabKeys(e, keys, region, setRegion)}
                  style={s(
                    `height: 42px; padding: 0 16px; border-radius: 999px; border: 1px solid ${on ? "#064F3B" : "#CFDDD5"}; background: ${on ? "#064F3B" : "#FFFFFF"}; color: ${on ? "#FFFFFF" : "#24343C"}; font: 700 14px 'Plus Jakarta Sans', sans-serif; cursor: pointer;`,
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <div id="ck-region-panel" role="tabpanel" aria-labelledby={`tab-${region}`} style={s("padding: 20px; border-radius: 16px; background: #ECFBF4; display: flex; flex-direction: column; gap: 10px;")}>
            <h3 style={s("margin: 0; font-size: 17px; font-weight: 750;")}>{cur.title}</h3>
            <p style={s("margin: 0; font-size: 16px; line-height: 1.65;")}>{cur.text}</p>
          </div>
        </div>
        <div>
          <h2 style={s("margin: 0 0 14px; font-size: 22px; font-weight: 800;")}>Consent lifecycle</h2>
          <ol style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0;")}>
            {[
              { n: 1, title: "Before you choose", text: "Only strictly necessary technologies run where prior consent is required." },
              { n: 2, title: "You decide", text: "Rejecting is as easy as accepting. Choices are per category, with purpose and provider information." },
              { n: 3, title: "Your choice is recorded", text: "A consent identifier, region, timestamp, policy/banner version, categories accepted/rejected, language and source." },
              { n: 4, title: "Change or withdraw anytime", text: "Use Cookie settings in the footer. Re-consent is requested when purposes or providers materially change or law requires." },
            ].map((l) => (
              <li key={l.n} style={s("display: flex; gap: 14px;")}>
                <div style={s("display: flex; flex-direction: column; align-items: center;")}>
                  <span style={s("width: 30px; height: 30px; border-radius: 50%; background: #064F3B; color: #FFFFFF; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center;")}>{l.n}</span>
                  <span style={s("flex: 1; width: 2px; background: #BFE8D3; min-height: 18px;")} />
                </div>
                <div style={s("padding-bottom: 18px;")}>
                  <h3 style={s("margin: 3px 0 4px; font-size: 16px; font-weight: 750;")}>{l.title}</h3>
                  <p style={s("margin: 0; font-size: 15px; line-height: 1.55; color: #24343C;")}>{l.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

export function CookieInventory({ inventory }: { inventory: CookieRow[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const rows = inventory.filter((r) => (cat === "all" || r.categoryKey === cat) && (!q || `${r.name} ${r.provider}`.toLowerCase().includes(q.toLowerCase())));
  const noInv = inventory.length === 0;
  const field = "font: 500 15px 'Plus Jakarta Sans', sans-serif; border-radius: 10px; border: 1px solid #CFDDD5; height: 42px;";
  const th = s("text-align: left; padding: 12px 18px;");
  const td = s("padding: 12px 18px;");
  return (
    <section id="inventory" aria-labelledby="inv-h" style={s("max-width: 1240px; margin: 0 auto; padding: 40px 24px 12px; scroll-margin-top: 90px;")}>
      <div style={s("display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: end; justify-content: space-between; margin-bottom: 14px;")}>
        <div>
          <h2 id="inv-h" style={s("margin: 0 0 4px; font-size: 22px; font-weight: 800;")}>
            Cookie and technology inventory
          </h2>
          <p style={s("margin: 0; font-size: 14px; color: #4C5B63;")}>Cookies, local storage, pixels and SDKs on Noxtill websites and web applications.</p>
        </div>
        <div style={s("display: flex; flex-wrap: wrap; gap: 8px;")} data-noprint="true">
          <label style={s("display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 700;")}>
            Search
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or provider" style={s(`${field} width: 220px; padding: 0 12px;`)} />
          </label>
          <label style={s("display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 700;")}>
            Category
            <select value={cat} onChange={(e) => setCat(e.target.value)} style={s(`${field} padding: 0 10px;`)}>
              <option value="all">All categories</option>
              <option value="necessary">Strictly necessary</option>
              <option value="functional">Functional</option>
              <option value="analytics">Analytics</option>
              <option value="advertising">Advertising/targeting</option>
            </select>
          </label>
        </div>
      </div>
      <div style={s("overflow-x: auto; border: 1px solid #D9E8E0; border-radius: 16px;")}>
        <table style={s("width: 100%; border-collapse: collapse; font-size: 15px; min-width: 720px;")}>
          <caption style={s("text-align: left; padding: 12px 18px; font-size: 13px; color: #4C5B63; border-bottom: 1px solid #D9E8E0;")}>Technologies in use, by provider and category</caption>
          <thead>
            <tr style={s("background: #F7FAF8;")}>
              {["Name", "Provider", "Category", "Purpose", "Duration"].map((h) => (
                <th key={h} scope="col" style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} style={s("border-top: 1px solid #E3EEE8;")}>
                <th scope="row" style={s("text-align: left; padding: 12px 18px; font-family: 'JetBrains Mono', monospace; font-size: 13px;")}>
                  {r.name}
                </th>
                <td style={td}>{r.provider}</td>
                <td style={td}>{r.category}</td>
                <td style={td}>{r.purpose}</td>
                <td style={td}>{r.duration}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={s("padding: 28px 18px; text-align: center; color: #3A4A52; font-size: 15px; line-height: 1.6;")}>
                  <strong style={s("display: block; color: #0B1822; margin-bottom: 4px;")}>{noInv ? "Inventory not yet published" : "No technologies match your search"}</strong>
                  {noInv
                    ? "This table is published from a verified automated scan reviewed by engineering and legal. Entries appear here once confirmed — Noxtill does not list technologies it has not verified."
                    : "Try a different name, provider or category."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
