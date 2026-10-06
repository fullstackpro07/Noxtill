"use client";

import { useEffect, useRef, useState } from "react";
import { s } from "@/components/site/legal/s";
import { EMAIL_RE, jumpTo } from "@/components/site/legal/use-legal";
import { submitLegalForm } from "@/lib/legal-public-api";
import type { SubprocessorRow } from "@/lib/marketing/legal/nox";

const COLS = ["Category", "Provider / legal entity", "Service", "Purpose", "Data categories", "Location / region", "Role", "Link", "Effective"];

export function SubscribeButton() {
  return (
    <a
      href="#subscribe"
      onClick={jumpTo("subscribe")}
      style={s("display: inline-flex; align-items: center; height: 48px; padding: 0 22px; border-radius: 12px; background: #064F3B; color: #FFFFFF; font-weight: 800; font-size: 15px; text-decoration: none;")}
      data-noprint="true"
    >
      Subscribe to updates
    </a>
  );
}

export function SubprocessorRegister({ register, fieldList }: { register: SubprocessorRow[]; fieldList: string }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState({ category: "all", region: "all", role: "all" });
  const uniq = (k: "category" | "region" | "role") => Array.from(new Set(register.map((r) => r[k]).filter(Boolean)));
  const rows = register.filter(
    (r) =>
      (f.category === "all" || r.category === f.category) &&
      (f.region === "all" || r.region === f.region) &&
      (f.role === "all" || r.role === f.role) &&
      (!q || `${r.provider} ${r.service}`.toLowerCase().includes(q.toLowerCase())),
  );
  const filters: ["category" | "region" | "role", string, string][] = [
    ["category", "Category", "All categories"],
    ["region", "Region", "All regions"],
    ["role", "Role", "All roles"],
  ];
  const ctl = "height: 44px; border-radius: 10px; border: 1px solid #CFDDD5; font: 500 15px 'Plus Jakarta Sans', sans-serif;";
  const td = s("padding: 12px 14px;");
  return (
    <section id="register" aria-labelledby="reg-h" style={s("max-width: 1240px; margin: 0 auto; padding: 36px 24px 12px; scroll-margin-top: 90px;")}>
      <h2 id="reg-h" style={s("margin: 0 0 14px; font-size: 24px; font-weight: 800;")}>
        Subprocessor register
      </h2>
      <div role="search" aria-label="Filter subprocessors" style={s("display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;")} data-noprint="true">
        <label style={s("display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 700; flex: 1 1 220px;")}>
          Search
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Provider or service" style={s(`${ctl} padding: 0 12px;`)} />
        </label>
        {filters.map(([key, label, allLabel]) => (
          <label key={key} style={s("display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 700; flex: 0 1 200px;")}>
            {label}
            <select value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} style={s(`${ctl} padding: 0 10px;`)}>
              <option value="all">{allLabel}</option>
              {uniq(key).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div style={s("overflow-x: auto; border: 1px solid #D9E8E0; border-radius: 16px;")}>
        <table style={s("width: 100%; border-collapse: collapse; font-size: 14px; min-width: 980px;")}>
          <caption style={s("text-align: left; padding: 12px 18px; font-size: 13px; color: #4C5B63; border-bottom: 1px solid #D9E8E0;")}>Noxtill subprocessors that process Customer Personal Data on Noxtill’s instructions</caption>
          <thead>
            <tr style={s("background: #F7FAF8;")}>
              {COLS.map((c) => (
                <th key={c} scope="col" style={s("text-align: left; padding: 12px 14px; font-weight: 700; white-space: nowrap;")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.provider}-${r.service}`} style={s("border-top: 1px solid #E3EEE8;")}>
                <td style={td}>{r.category}</td>
                <th scope="row" style={s("text-align: left; padding: 12px 14px;")}>
                  {r.provider}
                </th>
                <td style={td}>{r.service}</td>
                <td style={td}>{r.purpose}</td>
                <td style={td}>{r.data}</td>
                <td style={td}>{r.region}</td>
                <td style={td}>{r.role}</td>
                <td style={td}>
                  <a href={r.link} target="_blank" rel="noopener">
                    Privacy/security
                  </a>
                </td>
                <td style={td}>{r.effective}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} style={s("padding: 36px 18px; text-align: center;")}>
                  <strong style={s("display: block; font-size: 16px; margin-bottom: 6px;")}>{register.length ? "No providers match these filters" : "Register publication pending"}</strong>
                  <span style={s("font-size: 15px; line-height: 1.6; color: #3A4A52; display: block; max-width: 640px; margin: 0 auto;")}>
                    {register.length
                      ? "Clear a filter or search term."
                      : "Noxtill lists a subprocessor only after its role, contract and processing region have been verified against the production vendor inventory and reviewed by legal. Verified entries will appear here with their effective date."}
                  </span>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p style={s("margin: 12px 0 0; font-size: 13px; color: #4C5B63;")}>Each entry lists: {fieldList}.</p>
    </section>
  );
}

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  const [tried, setTried] = useState(false);
  const t0 = useRef(0);
  useEffect(() => {
    t0.current = Date.now();
  }, []);
  const valid = EMAIL_RE.test(email);
  const subscribe = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (hp) return;
    if (!valid) {
      setMsg("Enter a valid work email address.");
      setErr(true);
      return;
    }
    if (Date.now() - t0.current < 1500) {
      setMsg("Please wait a moment and submit again.");
      setErr(true);
      return;
    }
    setBusy(true);
    setMsg("Submitting…");
    setErr(false);
    submitLegalForm({ route: "subprocessor-updates", fields: { email }, page: "/trust/subprocessors", website: hp })
      .then(() => {
        setBusy(false);
        setErr(false);
        setMsg("Request received. privacy@noxtill.com will add this address to the subprocessor change-notice list.");
      })
      .catch(() => {
        setBusy(false);
        setErr(true);
        setMsg("We could not complete your subscription just now. Nothing was saved. Email privacy@noxtill.com to be added to the notification list.");
      });
  };
  return (
    <form onSubmit={subscribe} noValidate style={s("display: flex; flex-direction: column; gap: 10px;")}>
      <label htmlFor="sub-email" style={s("font-size: 14px; font-weight: 700;")}>
        Work email
      </label>
      <input
        id="sub-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={tried && !valid}
        aria-describedby="sub-msg"
        style={s(`height: 48px; padding: 0 14px; border-radius: 11px; border: 2px solid ${tried && !valid ? "#F2A79C" : "transparent"}; font: 500 16px 'Plus Jakarta Sans', sans-serif;`)}
      />
      <input
        type="text"
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        style={s("position: absolute; left: -9999px; width: 1px; height: 1px;")}
      />
      <button type="submit" disabled={busy} style={s("height: 48px; border-radius: 11px; border: 0; background: #44F0B0; color: #043F31; font: 800 15px 'Plus Jakarta Sans', sans-serif; cursor: pointer;")}>
        {busy ? "Submitting…" : "Subscribe by email"}
      </button>
      <p id="sub-msg" role="status" aria-live="polite" style={s(`margin: 0; font-size: 14px; line-height: 1.5; color: ${err ? "#FFD3CC" : "#D7EFE5"};`)}>
        {msg}
      </p>
    </form>
  );
}
