"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { cssToObj, type DcNode } from "./dc-render";
import { submitBookDemo } from "./dc-forms";

type El = Exclude<DcNode, string>;
const els = (n: El) => n[2].filter((c): c is El => typeof c !== "string");
const st = (n: El | undefined): CSSProperties => (n?.[1].style ? cssToObj(n[1].style) : {});
const text = (n: El | undefined) => (n ? n[2].filter((c) => typeof c === "string").join("").trim() : "");

const BUSINESS_TYPES = ["Retail", "Restaurant", "Salon or spa", "Healthcare or clinic", "Professional services", "Service business", "Fitness", "Education", "Other"];
const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}

/**
 * Book a Demo — docs/Noxtill Pages/Book a Demo-end.dc.html. The design draws this form as a static
 * mock (one placeholder option, a fixed September 2026 calendar, a "Confirm" link to the contact
 * page). Here it works: real business types, the current fortnight with past days disabled, a
 * selectable slot, and submission to the sales inbox. Every style comes from the design's own node,
 * so it renders identically.
 */
export function BookDemoForm({ node }: { node: El }) {
  const kids = els(node);
  const [h2, intro, lblName, inName, lblEmail, inEmail, lblType, sel, lblDate, cal, times, confirm, secure] = kids;
  const [calHead, calWeek, calDays] = els(cal);
  const dayNodes = els(calDays);
  const dayPlain = st(dayNodes.find((d) => !/background/.test(d[1].style || "")));
  const daySel = st(dayNodes.find((d) => /background/.test(d[1].style || "")));
  const timeNodes = els(times);
  const timeSel = st(timeNodes.find((t) => /1\.5px/.test(t[1].style || "")));
  const timePlain = st(timeNodes.find((t) => !/1\.5px/.test(t[1].style || "")));
  const slots = timeNodes.map(text);

  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);
  const [weekOffset, setWeekOffset] = useState(0);
  const first = useMemo(() => {
    const d = startOfWeek(today);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [today, weekOffset]);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i)), [first]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState("");
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<string>("");
  const [state, setState] = useState<{ status: "idle" | "sending" | "sent" | "error"; message?: string }>({ status: "idle" });

  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (state.status === "sending" || state.status === "sent") return;
    if (!name.trim() || !email.trim()) return setState({ status: "error", message: "Enter your name and business email." });
    if (!day || !slot) return setState({ status: "error", message: "Pick a day and a time for your demo." });
    setState({ status: "sending" });
    const r = await submitBookDemo({ name: name.trim(), email: email.trim(), businessType: type, preferredTime: `${DAY.format(day)}, ${slot} (visitor's local time)` });
    setState(r.ok ? { status: "sent" } : { status: "error", message: r.message });
  };

  const clickable: CSSProperties = { cursor: "pointer" };
  const note =
    state.status === "sent"
      ? "✓ Request received — our team will confirm your demo time by email."
      : state.status === "error"
        ? state.message
        : text(secure);

  return (
    <form aria-label={node[1]["aria-label"]} className="np-bookdemo" style={st(node)} onSubmit={submit} noValidate>
      {/* The design pins this card at 622px with a -250px overlap on the hero image; below the design's
          own 1100px breakpoint that pushes it off-screen, so let it fill the column there. */}
      <style>{"@media (max-width:1100px){.np-bookdemo{width:100%!important;height:auto!important;margin-left:0!important;margin-right:0!important}}"}</style>
      <h2 data-h2="1" style={st(h2)}>
        {text(h2)}
      </h2>
      <p style={st(intro)}>{text(intro)}</p>
      <label htmlFor="bd-name" style={st(lblName)}>
        {text(lblName)}
      </label>
      <input id="bd-name" type="text" autoComplete="name" required placeholder={inName[1].placeholder} style={st(inName)} value={name} onChange={(e) => setName(e.target.value)} />
      <label htmlFor="bd-email" style={st(lblEmail)}>
        {text(lblEmail)}
      </label>
      <input id="bd-email" type="email" autoComplete="email" required placeholder={inEmail[1].placeholder} style={st(inEmail)} value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="bd-type" style={st(lblType)}>
        {text(lblType)}
      </label>
      <select id="bd-type" style={{ ...st(sel), ...(type ? { color: "#33403A" } : {}) }} value={type} onChange={(e) => setType(e.target.value)}>
        <option value="">{text(els(sel)[0])}</option>
        {BUSINESS_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <label style={st(lblDate)}>{text(lblDate)}</label>
      <div style={st(cal)}>
        <div style={st(calHead)}>
          <button type="button" aria-label="Previous weeks" disabled={weekOffset === 0} onClick={() => setWeekOffset((w) => Math.max(0, w - 2))} style={{ all: "unset", cursor: weekOffset === 0 ? "default" : "pointer", opacity: weekOffset === 0 ? 0.35 : 1 }}>
            ‹
          </button>
          <span>{MONTH.format(days[0])}</span>
          <button type="button" aria-label="Next weeks" disabled={weekOffset >= 6} onClick={() => setWeekOffset((w) => Math.min(6, w + 2))} style={{ all: "unset", cursor: "pointer", opacity: weekOffset >= 6 ? 0.35 : 1 }}>
            ›
          </button>
        </div>
        <div style={st(calWeek)}>
          {els(calWeek).map((w, i) => (
            <span key={i}>{text(w)}</span>
          ))}
        </div>
        <div style={st(calDays)} role="radiogroup" aria-label="Demo day">
          {days.map((d) => {
            const past = d <= today || d.getDay() === 0 || d.getDay() === 6;
            const on = !!day && d.getTime() === day.getTime();
            return (
              <span
                key={d.getTime()}
                role="radio"
                aria-checked={on}
                aria-disabled={past}
                aria-label={DAY.format(d)}
                tabIndex={past ? -1 : 0}
                onClick={() => !past && setDay(d)}
                onKeyDown={(e) => {
                  if (!past && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    setDay(d);
                  }
                }}
                style={{ ...(on ? daySel : dayPlain), ...(past ? { opacity: 0.35 } : clickable) }}
              >
                {d.getDate()}
              </span>
            );
          })}
        </div>
      </div>
      <div style={st(times)} role="radiogroup" aria-label="Demo time">
        {slots.map((t) => {
          const on = slot === t;
          return (
            <span
              key={t}
              role="radio"
              aria-checked={on}
              tabIndex={0}
              onClick={() => setSlot(t)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSlot(t);
                }
              }}
              style={{ ...(on ? timeSel : timePlain), ...clickable }}
            >
              {t}
            </span>
          );
        })}
      </div>
      <button type="submit" className={confirm[1].className} style={{ font: "inherit", ...st(confirm), width: "100%", border: 0, cursor: "pointer" }} disabled={state.status === "sending"}>
        {state.status === "sending" ? "Sending…" : state.status === "sent" ? "Request sent ✓" : text(confirm)}
      </button>
      <p style={{ ...st(secure), ...(state.status === "error" ? { color: "#B42318" } : {}) }} aria-live="polite">
        {note}
      </p>
    </form>
  );
}
