"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { s } from "@/components/site/legal/s";
import { EMAIL_RE, jump, sensitiveCheck } from "@/components/site/legal/use-legal";
import { submitLegalForm, type LegalFormRoute } from "@/lib/legal-public-api";

type FieldType = "text" | "email" | "tel" | "select" | "area";
type Field = [string, string, FieldType, boolean, string, string[]?, number?];
interface Route {
  kicker: string;
  title: string;
  desc: string;
  email: string;
  formTitle: string;
  intro: string;
  fields: Field[];
}

const ROUTES: Record<"privacy" | "support" | "sales" | "general" | "info", Route> = {
  privacy: {
    kicker: "Privacy / data rights",
    title: "Privacy request",
    desc: "Access, correct, delete or other privacy rights.",
    email: "privacy@noxtill.com",
    formTitle: "Privacy request",
    intro: "We verify identity proportionately and only ask for what we need. If your data is held by a business that uses Noxtill, we may direct you to that business first.",
    fields: [
      ["name", "Full name", "text", true, "name"],
      ["email", "Email", "email", true, "email"],
      ["relationship", "Your relationship with Noxtill", "select", true, "", ["Website visitor", "Customer owner/admin", "Authorized user", "Customer’s customer or staff", "Job applicant", "Other"]],
      [
        "requestType",
        "Request type",
        "select",
        true,
        "",
        ["Access / know", "Correct", "Delete", "Restrict or object", "Portability", "Withdraw consent", "Opt out of sale, sharing or targeted advertising", "Limit use of sensitive data", "Appeal a decision", "Other"],
      ],
      ["region", "Region", "select", true, "", ["United States", "California", "Other U.S. state", "EEA", "United Kingdom", "Canada", "Other"]],
      ["business", "Business or workspace name", "text", false, "organization"],
      ["details", "Details", "area", false, "", undefined, 600],
    ],
  },
  support: {
    kicker: "Support / account",
    title: "Support",
    desc: "Technical, account, billing, refund and abuse reports.",
    email: "support@noxtill.com",
    formTitle: "Support request",
    intro: "Include your workspace ID and, for errors, the correlation ID shown in the app.",
    fields: [
      ["name", "Full name", "text", true, "name"],
      ["email", "Account email", "email", true, "email"],
      ["topic", "Topic", "select", true, "", ["Technical issue", "Billing, refund or cancellation", "Report abuse", "Report an AI issue", "Accessibility barrier", "Security concern", "Appeal an enforcement action", "Other"]],
      ["workspace", "Workspace / account ID", "text", false, ""],
      ["correlation", "Correlation ID", "text", false, ""],
      ["details", "What happened?", "area", true, "", undefined, 2000],
    ],
  },
  sales: {
    kicker: "Sales",
    title: "Sales & demo",
    desc: "Demo, plans and your business needs.",
    email: "sales@noxtill.com",
    formTitle: "Book a demo",
    intro: "Tell us about your business and we’ll arrange a walkthrough.",
    fields: [
      ["name", "Full name", "text", true, "name"],
      ["email", "Work email", "email", true, "email"],
      ["company", "Business name", "text", true, "organization"],
      ["phone", "Phone", "tel", false, "tel"],
      ["details", "What would you like to run on Noxtill?", "area", false, "", undefined, 1500],
    ],
  },
  general: {
    kicker: "General company",
    title: "General enquiry",
    desc: "Company questions and legal notices.",
    email: "contact@noxtill.com",
    formTitle: "General enquiry",
    intro: "For company questions and legal notices.",
    fields: [
      ["name", "Full name", "text", true, "name"],
      ["email", "Email", "email", true, "email"],
      ["subject", "Subject", "text", true, ""],
      ["details", "Message", "area", true, "", undefined, 2000],
    ],
  },
  info: {
    kicker: "Information / press",
    title: "Information & press",
    desc: "Press, partnerships and general information.",
    email: "info@noxtill.com",
    formTitle: "Information request",
    intro: "Press, partnership and information requests.",
    fields: [
      ["name", "Full name", "text", true, "name"],
      ["email", "Email", "email", true, "email"],
      ["organization", "Organization", "text", false, "organization"],
      ["details", "Message", "area", true, "", undefined, 2000],
    ],
  },
};
type RouteKey = keyof typeof ROUTES;
type Result = { ok: boolean; title: string; text: string; mail: boolean };

export function ContactView() {
  const [route, setRoute] = useState<RouteKey>("support");
  const [values, setValues] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [hp, setHp] = useState("");
  const t0 = useRef(0);
  // Time gate starts when the visitor lands on (or switches to) a form.
  useEffect(() => {
    t0.current = Date.now();
  }, [route]);

  useEffect(() => {
    const h = window.location.hash.slice(1) as RouteKey;
    if (ROUTES[h]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL hash is unavailable during SSR, so it can only be read post-mount
      setRoute(h);
      setTimeout(() => jump("ct-form"), 200);
    }
  }, []);

  const pick = (k: RouteKey) => {
    setRoute(k);
    setValues({});
    setTried(false);
    setResult(null);
    try {
      history.replaceState(null, "", `#${k}`);
    } catch {
      /* history unavailable — route still switches */
    }
    setTimeout(() => document.getElementById("form-h")?.focus(), 50);
  };

  const R = ROUTES[route];
  const errs: Record<string, string> = {};
  R.fields.forEach(([id, label, type, req]) => {
    const val = (values[id] || "").trim();
    if (req && !val) errs[id] = `Enter ${label.toLowerCase()}.`;
    else if (type === "email" && val && !EMAIL_RE.test(val)) errs[id] = "Enter a valid email address, like name@business.com.";
    else if ((type === "area" || type === "text") && val) {
      const sc = sensitiveCheck(val);
      if (sc) errs[id] = sc;
    }
  });
  const nErr = Object.keys(errs).length;
  const subj = encodeURIComponent(`[${R.title}] ${values.subject || values.topic || values.requestType || "Enquiry"}`);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (nErr) {
      setTimeout(() => {
        const first = R.fields.find((f) => errs[f[0]]);
        if (first) document.getElementById(`${route}-${first[0]}`)?.focus();
      }, 30);
      return;
    }
    if (hp || Date.now() - t0.current < 2500) {
      setResult({ ok: false, title: "Please try again", text: "We couldn’t verify this submission. Wait a moment and submit again.", mail: false });
      return;
    }
    setBusy(true);
    setResult(null);
    submitLegalForm({ route: route as LegalFormRoute, fields: values, page: "/contact", website: hp })
      .then(() => {
        setBusy(false);
        setValues({});
        setTried(false);
        setResult({ ok: true, title: "Request received", text: `Your request was delivered to ${R.email}. We’ll reply by email.`, mail: false });
      })
      .catch(() => {
        setBusy(false);
        setResult({ ok: false, title: "Not sent", text: "Your message could not be delivered just now. Nothing was sent.", mail: true });
      });
  };

  return (
    <>
      <section aria-labelledby="ct-h1" style={s("background: #F7FAF8; border-bottom: 1px solid #E3EEE8;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 40px;")}>
          <nav aria-label="Breadcrumb" style={s("font-size: 14px; color: #4C5B63;")}>
            <ol style={s("list-style: none; margin: 0; padding: 0; display: flex; gap: 8px;")}>
              <li>
                <Link href="/" className="h-ul" style={s("color: #4C5B63; text-decoration: none;")}>
                  Home
                </Link>
              </li>
              <li aria-hidden="true">›</li>
              <li>
                <span aria-current="page" style={s("color: #0B1822; font-weight: 600;")}>
                  Contact
                </span>
              </li>
            </ol>
          </nav>
          <div style={s("margin-top: 26px; display: flex; flex-direction: column; gap: 10px;")}>
            <h1 id="ct-h1" style={s("margin: 0; font-size: clamp(36px, 4.6vw, 54px); line-height: 1.06; font-weight: 800; letter-spacing: -0.03em;")}>
              Contact Noxtill
            </h1>
            <p style={s("margin: 0; font-size: clamp(20px, 2.2vw, 26px); font-weight: 700; color: #064F3B;")}>Talk to the right team.</p>
          </div>
          <div role="radiogroup" aria-label="What do you need?" style={s("margin-top: 28px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: 12px;")}>
            {(Object.keys(ROUTES) as RouteKey[]).map((k) => {
              const r = ROUTES[k];
              const on = k === route;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-controls="ct-form"
                  onClick={() => pick(k)}
                  style={s(
                    `text-align: left; display: flex; flex-direction: column; gap: 8px; padding: 20px; border-radius: 18px; border: 2px solid ${on ? "#043F31" : "#D9E8E0"}; background: ${on ? "#043F31" : "#FFFFFF"}; color: ${on ? "#FFFFFF" : "#0B1822"}; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; min-height: 150px;`,
                  )}
                >
                  <span style={s(`font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: ${on ? "#44F0B0" : "#067A50"};`)}>{r.kicker}</span>
                  <span style={s("font-size: 19px; font-weight: 800;")}>{r.title}</span>
                  <span style={s("font-size: 14px; line-height: 1.5; opacity: 0.9;")}>{r.desc}</span>
                  <span style={s("margin-top: auto; font-size: 14px; font-weight: 700;")}>{r.email}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section style={s("max-width: 1240px; margin: 0 auto; padding: 36px 24px 48px; display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start;")}>
        <div id="ct-form" style={s("flex: 999 1 560px; min-width: 0; scroll-margin-top: 90px;")}>
          <h2 id="form-h" tabIndex={-1} style={s("margin: 0 0 6px; font-size: 26px; font-weight: 800; outline: none;")}>
            {R.formTitle}
          </h2>
          <p style={s("margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #3A4A52;")}>
            {R.intro} Routed to{" "}
            <a href={`mailto:${R.email}`} style={s("font-weight: 700;")}>
              {R.email}
            </a>
            .
          </p>
          <div role="note" style={s("display: flex; gap: 12px; padding: 14px 16px; border-radius: 12px; background: #FFF4E0; border: 1px solid #F2D49B; margin-bottom: 20px; font-size: 14px; line-height: 1.55; color: #4A3000;")}>
            <span aria-hidden="true" style={s("font-weight: 800;")}>
              !
            </span>
            <span>
              <strong>Never include passwords, full payment-card numbers, API keys or OAuth tokens.</strong> Noxtill will never ask for them. Don’t share health or other sensitive information unless it is needed for your request.
            </span>
          </div>
          <form onSubmit={submit} noValidate aria-labelledby="form-h" style={s("display: flex; flex-direction: column; gap: 16px;")}>
            {tried && nErr > 0 ? (
              <div role="alert" style={s("padding: 14px 16px; border-radius: 12px; background: #FDE7E4; color: #6E1E15; font-size: 15px; font-weight: 600;")}>
                {nErr === 1 ? "There is 1 problem to fix before sending." : `There are ${nErr} problems to fix before sending.`}
              </div>
            ) : null}
            <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 16px;")}>
              {R.fields.map(([id, label, type, req, ac, options, max]) => {
                const e = tried ? errs[id] : "";
                const fid = `${route}-${id}`;
                const bd = e ? "#B4362A" : "#BFD3C8";
                const msg = e || (type === "area" ? `Up to ${max || 200} characters.` : "");
                const onChange = (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
                  setValues({ ...values, [id]: ev.target.value });
                  setResult(null);
                };
                return (
                  <div key={fid} style={s(`display: flex; flex-direction: column; gap: 6px; grid-column: ${type === "area" ? "1 / -1" : "auto"};`)}>
                    <label htmlFor={fid} style={s("font-size: 14px; font-weight: 700;")}>
                      {label}
                      {req ? (
                        <span aria-hidden="true" style={s("color: #8A2A1E;")}>
                          {" "}
                          *
                        </span>
                      ) : (
                        <span style={s("font-weight: 500; color: #4C5B63;")}> (optional)</span>
                      )}
                    </label>
                    {type === "select" ? (
                      <select
                        id={fid}
                        value={values[id] || ""}
                        onChange={onChange}
                        required={req}
                        aria-invalid={!!e}
                        aria-describedby={`${fid}-d`}
                        style={s(`height: 48px; padding: 0 12px; border-radius: 11px; border: 1px solid ${bd}; font: 500 16px 'Plus Jakarta Sans', sans-serif; background: #FFFFFF;`)}
                      >
                        <option value="">Choose…</option>
                        {(options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : type === "area" ? (
                      <textarea
                        id={fid}
                        rows={5}
                        value={values[id] || ""}
                        onChange={onChange}
                        required={req}
                        aria-invalid={!!e}
                        aria-describedby={`${fid}-d`}
                        maxLength={max || 200}
                        style={s(`padding: 12px 14px; border-radius: 11px; border: 1px solid ${bd}; font: 500 16px/1.5 'Plus Jakarta Sans', sans-serif; resize: vertical;`)}
                      />
                    ) : (
                      <input
                        id={fid}
                        type={type}
                        value={values[id] || ""}
                        onChange={onChange}
                        autoComplete={ac || "off"}
                        required={req}
                        aria-invalid={!!e}
                        aria-describedby={`${fid}-d`}
                        maxLength={max || 200}
                        style={s(`height: 48px; padding: 0 14px; border-radius: 11px; border: 1px solid ${bd}; font: 500 16px 'Plus Jakarta Sans', sans-serif;`)}
                      />
                    )}
                    <span id={`${fid}-d`} style={s(`font-size: 13px; line-height: 1.45; color: ${e ? "#8A2A1E" : "#4C5B63"};`)}>
                      {msg}
                    </span>
                  </div>
                );
              })}
            </div>
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
            <div style={s("display: flex; flex-wrap: wrap; gap: 12px; align-items: center;")}>
              <button type="submit" disabled={busy} style={s("height: 50px; padding: 0 26px; border-radius: 12px; border: 0; background: #064F3B; color: #FFFFFF; font: 800 16px 'Plus Jakarta Sans', sans-serif; cursor: pointer;")}>
                {busy ? "Sending…" : `Send to ${R.email}`}
              </button>
              <span style={s("font-size: 13px; color: #4C5B63;")}>
                By submitting, you agree we may use these details to respond. See the <Link href="/legal/privacy">Privacy Policy</Link>.
              </span>
            </div>
            {result ? (
              <div role="status" aria-live="polite" style={s(`padding: 16px 18px; border-radius: 12px; background: ${result.ok ? "#DDF6EA" : "#FDE7E4"}; color: ${result.ok ? "#04573C" : "#6E1E15"}; font-size: 15px; line-height: 1.6;`)}>
                <strong style={s("display: block; margin-bottom: 4px;")}>{result.title}</strong>
                {result.text}{" "}
                {result.mail ? (
                  <a href={`mailto:${R.email}?subject=${subj}`} style={s("font-weight: 800; color: inherit;")}>
                    Email {R.email} instead
                  </a>
                ) : null}
              </div>
            ) : null}
          </form>
        </div>
        <aside aria-label="Company contact details" style={s("flex: 1 1 300px; display: flex; flex-direction: column; gap: 14px;")}>
          <div style={s("padding: 22px; border-radius: 18px; background: #043F31; color: #FFFFFF; display: flex; flex-direction: column; gap: 12px;")}>
            <h2 style={s("margin: 0; font-size: 18px; font-weight: 800;")}>Noxtill LLC</h2>
            <address style={s("font-style: normal; font-size: 15px; line-height: 1.6; color: #D7EFE5;")}>
              4539 N 22ND ST STE R
              <br />
              Phoenix, AZ 85016
              <br />
              United States
            </address>
            <a
              href="tel:+18089985302"
              style={s("display: inline-flex; align-items: center; height: 46px; padding: 0 16px; border-radius: 11px; background: #44F0B0; color: #043F31; font-weight: 800; font-size: 16px; text-decoration: none; align-self: flex-start;")}
            >
              Call +1 808 998 5302
            </a>
            <p style={s("margin: 0; font-size: 13px; color: #CFE8DD;")}>Business hours will be published here once finalized.</p>
          </div>
          <div style={s("padding: 20px; border-radius: 18px; border: 1px solid #D9E8E0; display: flex; flex-direction: column; gap: 8px; font-size: 15px;")}>
            <h2 style={s("margin: 0 0 4px; font-size: 16px; font-weight: 800;")}>Helpful before you write</h2>
            <Link href="/status">Service status</Link>
            <Link href="/trust/security#report">Report a security concern</Link>
            <Link href="/legal/privacy#rights">Your privacy rights</Link>
            <Link href="/legal/company">Legal &amp; company information</Link>
            <Link href="/trust">Trust Center</Link>
          </div>
        </aside>
      </section>
    </>
  );
}
