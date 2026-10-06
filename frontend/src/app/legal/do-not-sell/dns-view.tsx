"use client";

import { useEffect, useRef, useState } from "react";
import { s } from "@/components/site/legal/s";
import { EMAIL_RE, sensitiveCheck } from "@/components/site/legal/use-legal";
import { browserConsentId, recordConsent, submitLegalForm } from "@/lib/legal-public-api";

const DNS_KEY = "nox_dns_optout";
const PREFS_KEY = "nox_cookie_prefs";

type Field = [string, string, "text" | "email" | "select", boolean, string, string[]?];
const F: Field[] = [
  ["name", "Full name", "text", true, "name"],
  ["email", "Email", "email", true, "email"],
  ["country", "Country of residence", "text", true, "country-name"],
  ["region", "State / province / region", "text", false, "address-level1"],
  ["address", "Address", "text", false, "street-address"],
  ["relationship", "Relationship with Noxtill", "select", false, "", ["Website visitor", "Customer owner/admin", "Authorized user", "Customer’s customer or staff", "Other"]],
];
type Result = { ok: boolean; title: string; text: string; mail: boolean };

export function DnsOptOut({ policyVersion }: { policyVersion: string }) {
  const [opted, setOpted] = useState(false);
  const [gpc, setGpc] = useState(false);
  const [msg, setMsg] = useState("");
  const [v, setV] = useState<Record<string, string>>({});
  const [agent, setAgent] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [hp, setHp] = useState("");
  const t0 = useRef(0);
  useEffect(() => {
    t0.current = Date.now();
  }, []);

  const persist = (optedOut: boolean, signal: boolean, source = "do-not-sell-page") => {
    const timestamp = new Date().toISOString();
    try {
      localStorage.setItem(DNS_KEY, JSON.stringify({ optedOut, timestamp, source, policy_version: policyVersion }));
      const c = JSON.parse(localStorage.getItem(PREFS_KEY) || "null") || { categories: { functional: false, analytics: false, advertising: false } };
      if (optedOut) {
        c.categories = { ...c.categories, advertising: false };
        c.timestamp = timestamp;
        c.source = "do-not-sell-page";
        localStorage.setItem(PREFS_KEY, JSON.stringify(c));
      }
    } catch {
      setMsg("Your browser blocked saving this choice. Submit Step 2 to opt out for your account.");
      return;
    }
    setOpted(optedOut);
    setMsg(`${optedOut ? "Opted out on this browser. Advertising/targeting technologies are off." : "Opt-out removed for this browser."} Server-side record: syncing…`);
    recordConsent({ consentId: browserConsentId(), kind: "do_not_sell_or_share", policyVersion, optedOut, language: navigator.language, source, gpc: signal })
      .then(() => setMsg(`${optedOut ? "Opted out on this browser" : "Opt-out removed"} and recorded by Noxtill.`))
      .catch(() =>
        setMsg(`${optedOut ? "Opted out on this browser — advertising/targeting technologies are off." : "Opt-out removed for this browser."} The server-side record could not be confirmed, so no server record was created.`),
      );
  };

  useEffect(() => {
    const signal = !!(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
    let saved: { optedOut: boolean; timestamp: string } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(DNS_KEY) || "null");
    } catch {
      saved = null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- saved choices live in localStorage/navigator, unavailable during SSR
    setGpc(signal);
    setOpted(signal || !!saved?.optedOut);
    setMsg(
      signal
        ? "Opted out on this browser via Global Privacy Control."
        : saved?.optedOut
          ? `Opted out on this browser since ${new Date(saved.timestamp).toLocaleDateString()}.`
          : "Not opted out on this browser.",
    );
    if (signal && !saved?.optedOut) persist(true, true, "gpc");
    // persist is stable for this mount-only signal check
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errs: Record<string, string> = {};
  F.forEach(([id, label, type, req]) => {
    const val = (v[id] || "").trim();
    if (req && !val) errs[id] = `${type === "select" ? "Choose " : "Enter "}${label.toLowerCase()}.`;
    else if (type === "email" && val && !EMAIL_RE.test(val)) errs[id] = "Enter a valid email address.";
    else if (val) {
      const sc = sensitiveCheck(val);
      if (sc) errs[id] = sc;
    }
  });
  const n = Object.keys(errs).length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (n) {
      setTimeout(() => {
        const k = F.find((x) => errs[x[0]]);
        if (k) document.getElementById(`dns-${k[0]}`)?.focus();
      }, 30);
      return;
    }
    if (hp || Date.now() - t0.current < 2500) {
      setResult({ ok: false, title: "Please try again.", text: "We couldn’t verify this submission.", mail: false });
      return;
    }
    setBusy(true);
    setResult(null);
    submitLegalForm({ route: "do-not-sell-or-share", fields: v, page: "/legal/do-not-sell", authorizedAgent: agent, gpc, website: hp })
      .then(() => {
        setBusy(false);
        setV({});
        setTried(false);
        setResult({ ok: true, title: "Request received.", text: "It was delivered to privacy@noxtill.com — we’ll confirm by email once your opt-out is applied.", mail: false });
      })
      .catch(() => {
        setBusy(false);
        setResult({ ok: false, title: "Not sent.", text: "Your request could not be delivered just now. Nothing was sent.", mail: true });
      });
  };

  return (
    <section aria-labelledby="opt-h" style={s("max-width: 1040px; margin: 0 auto; padding: 40px 24px 12px;")} data-noprint="true">
      <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 20px;")}>
        <div style={s("padding: 24px; border-radius: 18px; border: 2px solid #079A63; display: flex; flex-direction: column; gap: 14px;")}>
          <span style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #067A50;")}>Step 1 · This browser</span>
          <h2 id="opt-h" style={s("margin: 0; font-size: 21px; font-weight: 800;")}>
            Opt out on this browser
          </h2>
          <div style={s("display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border-radius: 12px; background: #F7FAF8;")}>
            <span id="dns-sw-l" style={s("font-size: 15px; font-weight: 700; line-height: 1.4;")}>
              Opt out of sale, sharing and targeted advertising
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={opted}
              aria-labelledby="dns-sw-l"
              aria-disabled={gpc}
              onClick={() => {
                if (!gpc) persist(!opted, gpc);
              }}
              style={s(`position: relative; width: 56px; height: 32px; border-radius: 999px; border: 0; padding: 0; flex-shrink: 0; background: ${opted ? "#079A63" : "#9FB3AA"}; cursor: ${gpc ? "not-allowed" : "pointer"};`)}
            >
              <span
                style={s(`position: absolute; top: 4px; left: ${opted ? "28px" : "4px"}; width: 24px; height: 24px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: left .15s;`)}
              />
            </button>
          </div>
          {gpc ? (
            <p role="status" style={s("margin: 0; padding: 12px 14px; border-radius: 10px; background: #DDF6EA; color: #04573C; font-size: 14px; font-weight: 700;")}>
              Global Privacy Control detected — your browser’s opt-out signal is being honored.
            </p>
          ) : null}
          <p role="status" aria-live="polite" style={s("margin: 0; font-size: 14px; line-height: 1.55; color: #24343C;")}>
            {msg}
          </p>
          <p style={s("margin: 0; font-size: 13px; line-height: 1.5; color: #4C5B63;")}>
            Applies to this browser and device. Clearing cookies or using another browser requires opting out again — or submit Step 2 for your account.
          </p>
        </div>

        <div id="request" style={s("padding: 24px; border-radius: 18px; border: 1px solid #D9E8E0; display: flex; flex-direction: column; gap: 14px; scroll-margin-top: 120px;")}>
          <span style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #067A50;")}>Step 2 · Your account and records</span>
          <h2 style={s("margin: 0; font-size: 21px; font-weight: 800;")}>Submit an opt-out request</h2>
          <form onSubmit={submit} noValidate style={s("display: flex; flex-direction: column; gap: 12px;")}>
            {tried && n > 0 ? (
              <div role="alert" style={s("padding: 12px 14px; border-radius: 10px; background: #FDE7E4; color: #6E1E15; font-size: 14px; font-weight: 700;")}>
                {n === 1 ? "There is 1 problem to fix." : `There are ${n} problems to fix.`}
              </div>
            ) : null}
            {F.map(([id, label, type, req, ac, options]) => {
              const e = tried ? errs[id] : "";
              const fid = `dns-${id}`;
              const bd = e ? "#B4362A" : "#BFD3C8";
              const onChange = (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
                setV({ ...v, [id]: ev.target.value });
                setResult(null);
              };
              return (
                <div key={id} style={s("display: flex; flex-direction: column; gap: 5px;")}>
                  <label htmlFor={fid} style={s("font-size: 14px; font-weight: 700;")}>
                    {label}
                    {!req ? <span style={s("font-weight: 500; color: #4C5B63;")}> (optional)</span> : null}
                  </label>
                  {type === "select" ? (
                    <select
                      id={fid}
                      value={v[id] || ""}
                      onChange={onChange}
                      aria-invalid={!!e}
                      aria-describedby={`${fid}-d`}
                      style={s(`height: 46px; padding: 0 10px; border-radius: 10px; border: 1px solid ${bd}; font: 500 16px 'Plus Jakarta Sans', sans-serif; background: #FFFFFF;`)}
                    >
                      <option value="">Choose…</option>
                      {(options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={fid}
                      type={type}
                      value={v[id] || ""}
                      onChange={onChange}
                      autoComplete={ac || "off"}
                      aria-invalid={!!e}
                      aria-describedby={`${fid}-d`}
                      style={s(`height: 46px; padding: 0 12px; border-radius: 10px; border: 1px solid ${bd}; font: 500 16px 'Plus Jakarta Sans', sans-serif;`)}
                    />
                  )}
                  <span id={`${fid}-d`} style={s("font-size: 13px; color: #8A2A1E;")}>
                    {e || ""}
                  </span>
                </div>
              );
            })}
            <label style={s("display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.5;")}>
              <input type="checkbox" checked={agent} onChange={(e) => setAgent(e.target.checked)} style={s("width: 20px; height: 20px; margin: 1px 0 0; accent-color: #064F3B;")} />I am an authorized agent submitting on someone else’s behalf. Noxtill may ask for proof
              of authorization.
            </label>
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
              style={s("position: absolute; left: -9999px; width: 1px; height: 1px;")}
            />
            <button type="submit" disabled={busy} style={s("height: 48px; border-radius: 11px; border: 0; background: #064F3B; color: #FFFFFF; font: 800 15px 'Plus Jakarta Sans', sans-serif; cursor: pointer;")}>
              {busy ? "Sending…" : "Submit opt-out request"}
            </button>
            <p style={s("margin: 0; font-size: 13px; color: #4C5B63;")}>Routed to privacy@noxtill.com. Never include passwords or payment-card numbers.</p>
            {result ? (
              <div role="status" style={s(`padding: 14px; border-radius: 10px; background: ${result.ok ? "#DDF6EA" : "#FDE7E4"}; color: ${result.ok ? "#04573C" : "#6E1E15"}; font-size: 14px; line-height: 1.55;`)}>
                <strong>{result.title}</strong> {result.text}{" "}
                {result.mail ? (
                  <a href="mailto:privacy@noxtill.com?subject=Do%20Not%20Sell%20or%20Share%20request" style={s("color: inherit; font-weight: 800;")}>
                    Email privacy@noxtill.com
                  </a>
                ) : null}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}
