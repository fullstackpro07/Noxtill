"use client";

import { useState } from "react";
import { EMAIL_RE } from "@/components/site/legal/use-legal";
import { submitLegalForm } from "@/lib/legal-public-api";
import { FOOTER_SOCIALS } from "@/lib/marketing/footer-links";

/** "Get Noxtill updates" card matching the reference footer design. */
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
        setMsg("We couldn’t sign you up just now. Please try again.");
      });
  };

  return (
    <div className="nxf-newsletter-box">
      <h3 className="nxf-newsletter-title">Get Noxtill updates</h3>
      <p className="nxf-newsletter-sub">Product updates, new capabilities and business insights.</p>

      <form onSubmit={subscribe} noValidate className="nxf-newsletter-form">
        <label htmlFor="nxf-email" className="nl-sr">
          Email address
        </label>
        <div className={`nxf-input-wrap ${tried && !valid ? "nxf-input-err" : ""}`}>
          <input
            id="nxf-email"
            type="email"
            autoComplete="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={tried && !valid}
            aria-describedby="nxf-msg"
            className="nxf-email-input"
          />
          <button type="submit" disabled={busy} className="nxf-subscribe-btn">
            {busy ? "Submitting…" : "Subscribe →"}
          </button>
        </div>
        <input
          type="text"
          name="company_website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
          style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px" }}
        />
      </form>

      {msg ? (
        <p id="nxf-msg" role="status" aria-live="polite" className={`nxf-msg ${err ? "nxf-msg-err" : "nxf-msg-ok"}`}>
          {msg}
        </p>
      ) : null}

      <p className="nxf-privacy-note">No spam. Unsubscribe anytime. We respect your privacy.</p>

      <div className="nxf-socials-row" aria-label="Noxtill on social media">
        {FOOTER_SOCIALS.map((so) => (
          <a
            key={so.name}
            href={so.url}
            target="_blank"
            rel="noopener noreferrer"
            className="nxf-social-link"
          >
            {so.name}
          </a>
        ))}
      </div>
    </div>
  );
}
