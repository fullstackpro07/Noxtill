"use client";

import { useState } from "react";
import { s } from "@/components/site/legal/s";
import { EMAIL_RE } from "@/components/site/legal/use-legal";
import { submitLegalForm } from "@/lib/legal-public-api";

/** "Get Noxtill updates" signup — delivered to info@noxtill.com via the public forms endpoint. */
export function FooterNewsletter() {
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  const [tried, setTried] = useState(false);
  const valid = EMAIL_RE.test(email);

  const subscribe = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (hp) return;
    if (!valid) {
      setMsg("Enter a valid email address.");
      setErr(true);
      return;
    }
    setBusy(true);
    setMsg("");
    setErr(false);
    submitLegalForm({ route: "newsletter", fields: { email }, page: "/footer", website: hp })
      .then(() => {
        setBusy(false);
        setErr(false);
        setEmail("");
        setTried(false);
        setMsg("Request received — this address will be added to Noxtill updates.");
      })
      .catch(() => {
        setBusy(false);
        setErr(true);
        setMsg("We couldn’t sign you up just now — nothing was saved. Please try again.");
      });
  };

  return (
    <>
      <form onSubmit={subscribe} noValidate style={s("display: flex; flex-wrap: wrap; gap: 0; align-items: stretch;")}>
        <label htmlFor="nxf-email" className="nl-sr">
          Email address
        </label>
        <div
          className="nxf-field"
          style={s(
            `flex: 1 1 200px; min-width: 0; display: flex; align-items: center; gap: 12px; height: 54px; padding: 0 14px 0 clamp(14px, 2vw, 26px); box-sizing: border-box; border: 1px solid ${tried && !valid ? "#F2A79C" : "rgba(255,255,255,0.16)"}; background: rgba(3,32,25,0.72);`,
          )}
        >
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9D9D1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3.5 6.5 12 13l8.5-6.5" />
          </svg>
          <input
            id="nxf-email"
            className="nxf-email"
            type="email"
            autoComplete="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={tried && !valid}
            aria-describedby="nxf-msg"
            style={s("flex: 1; min-width: 0; height: 100%; border: 0; outline: none; background: transparent; color: #FFFFFF; font: 400 17px 'Plus Jakarta Sans', sans-serif; padding: 0;")}
          />
        </div>
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
        <button
          type="submit"
          disabled={busy}
          className="nxf-btn h-mint-btn"
          style={s(
            "justify-content: center; height: 54px; padding: 0 28px; border: 0; background: linear-gradient(180deg, #2BF0B6 0%, #17D9A0 100%); color: #032019; font: 700 18px 'Plus Jakarta Sans', sans-serif; display: inline-flex; align-items: center; gap: 8px; cursor: pointer;",
          )}
        >
          {busy ? "Submitting…" : "Subscribe →"}
        </button>
      </form>
      <p id="nxf-msg" role="status" aria-live="polite" style={s(`margin: 8px 0 0; min-height: 0; font-size: 14px; line-height: 1.5; color: ${err ? "#FFC9C0" : "#B9F5DE"};`)}>
        {msg}
      </p>
    </>
  );
}
