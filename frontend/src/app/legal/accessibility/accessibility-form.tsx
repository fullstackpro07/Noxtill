"use client";

import { useEffect, useRef, useState } from "react";
import { s } from "@/components/site/legal/s";
import { EMAIL_RE, sensitiveCheck } from "@/components/site/legal/use-legal";
import { submitLegalForm } from "@/lib/legal-public-api";

const F: [string, string, "text" | "area" | "email", boolean, string][] = [
  ["page", "Page or feature", "text", true, ""],
  ["task", "What were you trying to do?", "area", true, ""],
  ["at", "Assistive technology and browser", "text", false, ""],
  ["email", "Email for our reply", "email", true, "email"],
];

type Result = { ok: boolean; title: string; text: string; mail: boolean };

export function SkipLinkDemo() {
  return (
    <button
      type="button"
      onClick={() => {
        const a = document.querySelector<HTMLAnchorElement>('a[href="#main"]');
        if (a) {
          window.scrollTo({ top: 0 });
          a.focus();
        }
      }}
      style={s("align-self: flex-start; height: 46px; padding: 0 18px; border-radius: 10px; border: 2px solid #FFFFFF; background: transparent; color: #FFFFFF; font: 700 15px 'Plus Jakarta Sans', sans-serif; cursor: pointer;")}
    >
      Show the skip link
    </button>
  );
}

export function AccessibilityForm() {
  const [v, setV] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [hp, setHp] = useState("");
  const t0 = useRef(0);
  useEffect(() => {
    t0.current = Date.now();
  }, []);

  const errs: Record<string, string> = {};
  F.forEach(([id, label, type, req]) => {
    const val = (v[id] || "").trim();
    if (req && !val) errs[id] = `Enter ${label.toLowerCase().replace("?", "")}.`;
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
        if (k) document.getElementById(`acc-${k[0]}`)?.focus();
      }, 30);
      return;
    }
    if (hp || Date.now() - t0.current < 2500) {
      setResult({ ok: false, title: "Please try again.", text: "We couldn’t verify this submission.", mail: false });
      return;
    }
    setBusy(true);
    setResult(null);
    submitLegalForm({ route: "accessibility", fields: v, page: "/legal/accessibility", website: hp })
      .then(() => {
        setBusy(false);
        setV({});
        setTried(false);
        setResult({ ok: true, title: "Report received.", text: "It was delivered to support@noxtill.com — we will reply by email.", mail: false });
      })
      .catch(() => {
        setBusy(false);
        setResult({ ok: false, title: "Not sent.", text: "The report could not be delivered just now. Nothing was sent.", mail: true });
      });
  };

  return (
    <form onSubmit={submit} noValidate style={s("display: flex; flex-direction: column; gap: 16px;")}>
      {tried && n > 0 ? (
        <div role="alert" style={s("padding: 14px 16px; border-radius: 10px; background: #FFFFFF; border: 2px solid #8A2A1E; color: #6E1E15; font-weight: 700;")}>
          {n === 1 ? "There is 1 problem to fix." : `There are ${n} problems to fix.`}
        </div>
      ) : null}
      {F.map(([id, label, type, req, ac]) => {
        const e = tried ? errs[id] : "";
        const fid = `acc-${id}`;
        const bd = e ? "#8A2A1E" : "#3A4A52";
        const onChange = (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          setV({ ...v, [id]: ev.target.value });
          setResult(null);
        };
        return (
          <div key={id} style={s("display: flex; flex-direction: column; gap: 6px;")}>
            <label htmlFor={fid} style={s("font-size: 16px; font-weight: 700;")}>
              {label}
              {!req ? <span style={s("font-weight: 500;")}> (optional)</span> : null}
            </label>
            {type === "area" ? (
              <textarea
                id={fid}
                rows={4}
                value={v[id] || ""}
                onChange={onChange}
                aria-invalid={!!e}
                aria-describedby={`${fid}-d`}
                maxLength={1500}
                style={s(`padding: 12px 14px; border-radius: 10px; border: 2px solid ${bd}; font: 500 17px/1.5 'Plus Jakarta Sans', sans-serif;`)}
              />
            ) : (
              <input
                id={fid}
                type={type}
                value={v[id] || ""}
                onChange={onChange}
                autoComplete={ac || "off"}
                aria-invalid={!!e}
                aria-describedby={`${fid}-d`}
                style={s(`height: 50px; padding: 0 14px; border-radius: 10px; border: 2px solid ${bd}; font: 500 17px 'Plus Jakarta Sans', sans-serif;`)}
              />
            )}
            <span id={`${fid}-d`} style={s(`font-size: 14px; color: ${e ? "#8A2A1E" : "#3A4A52"}; font-weight: ${e ? 700 : 500};`)}>
              {e || ""}
            </span>
          </div>
        );
      })}
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
      <button
        type="submit"
        disabled={busy}
        style={s("align-self: flex-start; height: 52px; padding: 0 26px; border-radius: 12px; border: 0; background: #043F31; color: #FFFFFF; font: 800 16px 'Plus Jakarta Sans', sans-serif; cursor: pointer;")}
      >
        {busy ? "Sending…" : "Send report"}
      </button>
      {result ? (
        <div role="status" style={s(`padding: 16px; border-radius: 10px; background: #FFFFFF; border: 2px solid ${result.ok ? "#04573C" : "#8A2A1E"}; font-size: 16px; line-height: 1.6;`)}>
          <strong>{result.title}</strong> {result.text} {result.mail ? <a href="mailto:support@noxtill.com?subject=Accessibility%20barrier">Email support@noxtill.com</a> : null}
        </div>
      ) : null}
    </form>
  );
}
