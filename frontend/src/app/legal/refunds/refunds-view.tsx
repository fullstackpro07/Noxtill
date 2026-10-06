"use client";

import { useState } from "react";
import Link from "next/link";
import { s } from "@/components/site/legal/s";
import { jumpTo } from "@/components/site/legal/use-legal";

type Ans = "yes" | "no" | "unsure";
const Q: { q: string; help: string; opts: [Ans, string][] }[] = [
  {
    q: "Do you have a mandatory statutory or Paddle buyer right?",
    help: "For example, a consumer withdrawal right in your country, or a right under Paddle’s Buyer Terms or Refund Policy. If you are not sure, check Paddle’s live policy or ask support.",
    opts: [
      ["yes", "Yes"],
      ["no", "No"],
      ["unsure", "Not sure"],
    ],
  },
  {
    q: "Is your request within 7 calendar days of your first paid activation?",
    help: "The voluntary refund applies to the first paid activation of an eligible subscription.",
    opts: [
      ["yes", "Yes"],
      ["no", "No"],
    ],
  },
  {
    q: "Has there been any Material Product Usage?",
    help: "For example connecting an integration, importing live data, sending customer messages, running automations or publishing a site. See the table below.",
    opts: [
      ["yes", "Yes"],
      ["no", "No"],
      ["unsure", "Not sure"],
    ],
  },
];

type Result = { tone: "ok" | "warn" | "no"; tag: string; title: string; text: string; links: [string, string, string?][] };
const PADDLE_REFUND = "https://www.paddle.com/legal/refund-policy";
const SUPPORT = "/contact#support";

function resultFor(a: Ans[]): Result | null {
  if (a[0] === "yes")
    return { tone: "ok", tag: "Mandatory right", title: "Your mandatory right applies", text: "Where a statutory or Paddle buyer right applies, that right is followed. Noxtill’s voluntary rules never remove a non-waivable right.", links: [["Paddle Refund Policy", PADDLE_REFUND, "_blank"], ["Contact support", SUPPORT]] };
  if (a[0] === "unsure")
    return { tone: "warn", tag: "Check your rights", title: "Check for a mandatory right first", text: "Review Paddle’s live Refund Policy and Buyer Terms for your country, or ask support. Any mandatory protection that applies overrides Noxtill’s voluntary rule.", links: [["Paddle Refund Policy", PADDLE_REFUND, "_blank"], ["Contact support", SUPPORT]] };
  if (a[0] === "no" && a[1] === "no")
    return { tone: "no", tag: "Not eligible — voluntary refund", title: "Outside the 7-day voluntary window", text: "The voluntary refund is only available within 7 calendar days of the first paid activation. Your statutory rights, if any, are not affected. Cancelling stops future renewal.", links: [["How to cancel", "#r-5-6-cancellation"], ["Contact support", SUPPORT]] };
  if (a[2] === "yes")
    return { tone: "no", tag: "Not eligible — voluntary refund", title: "Material Product Usage has occurred", text: "The voluntary refund is not available after Material Product Usage. Support can tell you the specific usage category and date. Statutory rights are not waived. If a technical defect prevented access, see §5.8.", links: [["Technical defects (§5.8)", "#r-5-8-technical-defects"], ["Contact support", SUPPORT]] };
  if (a[2] === "unsure")
    return { tone: "warn", tag: "Support will confirm", title: "Support will check your usage record", text: "Material Product Usage is determined from recorded product events. Submit a request and support will confirm whether the voluntary refund applies.", links: [["Request refund", SUPPORT]] };
  if (a[2] === "no")
    return { tone: "ok", tag: "Likely eligible", title: "You may qualify for the voluntary refund", text: "If there has been no Material Product Usage, Noxtill supports a voluntary refund request within 7 calendar days, subject to fraud and abuse review (§5.9).", links: [["Request refund", SUPPORT]] };
  return null;
}

const TONES = { ok: ["#DDF6EA", "#04573C", "✓"], warn: ["#FFF1D6", "#7A4B00", "!"], no: ["#FDE7E4", "#8A2A1E", "✕"] } as const;

export function RefundEligibility() {
  const [a, setA] = useState<Ans[]>([]);
  const result = resultFor(a);
  const qi = a.length;
  const tone = TONES[result ? result.tone : "ok"];
  return (
    <section id="eligibility" aria-labelledby="elig-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 12px; scroll-margin-top: 90px;")} data-noprint="true">
      <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 28px; align-items: start;")}>
        <div style={s("display: flex; flex-direction: column; gap: 12px;")}>
          <h2 id="elig-h" style={s("margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.02em;")}>
            Am I eligible for a refund?
          </h2>
          <p style={s("margin: 0; font-size: 16px; line-height: 1.6; color: #3A4A52;")}>
            Answer three questions in the order Noxtill applies them. This tool is a guide — the policy text below and any mandatory right control the outcome.
          </p>
          <ol style={s("list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px;")}>
            {Q.map((q, i) => {
              const ans = a[i];
              const lbl = ans ? (q.opts.find((o) => o[0] === ans) ?? [])[1] : "";
              const cur = !result && i === qi;
              const skipped = !!result && i >= a.length;
              return (
                <li
                  key={q.q}
                  style={s(`display: flex; gap: 12px; align-items: center; padding: 12px 14px; border-radius: 12px; background: ${cur ? "#ECFBF4" : "#FFFFFF"}; border: 1px solid ${cur ? "#079A63" : "#E3EEE8"};`)}
                >
                  <span
                    style={s(
                      `width: 28px; height: 28px; border-radius: 50%; background: ${ans ? "#064F3B" : cur ? "#079A63" : "#9FB3AA"}; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; flex-shrink: 0;`,
                    )}
                  >
                    {i + 1}
                  </span>
                  <span style={s("flex: 1; font-size: 15px; font-weight: 600;")}>{q.q}</span>
                  <span style={s("font-size: 13px; font-weight: 700; color: #3A4A52;")}>{skipped ? "—" : lbl}</span>
                </li>
              );
            })}
          </ol>
        </div>
        <div
          role="region"
          aria-live="polite"
          aria-labelledby="elig-q"
          style={s("padding: 24px; border-radius: 18px; border: 1px solid #D9E8E0; background: #FFFFFF; box-shadow: 0 12px 32px -18px rgba(4,63,49,0.25); display: flex; flex-direction: column; gap: 16px;")}
        >
          {!result ? (
            <>
              <span style={s("font-size: 13px; font-weight: 700; color: #067A50; letter-spacing: 0.06em; text-transform: uppercase;")}>Question {qi + 1} of 3</span>
              <h3 id="elig-q" style={s("margin: 0; font-size: 21px; line-height: 1.35; font-weight: 750;")}>
                {Q[qi].q}
              </h3>
              <p style={s("margin: 0; font-size: 15px; line-height: 1.6; color: #3A4A52;")}>{Q[qi].help}</p>
              <div style={s("display: flex; flex-wrap: wrap; gap: 10px;")}>
                {Q[qi].opts.map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setA(a.concat([v]))}
                    className="h-mint"
                    style={s("height: 46px; padding: 0 20px; border-radius: 11px; border: 1px solid #9FD9BD; background: #FFFFFF; color: #043F31; font: 700 15px 'Plus Jakarta Sans', sans-serif; cursor: pointer;")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <span
                style={s(
                  `align-self: flex-start; font-size: 13px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 6px 10px; border-radius: 8px; background: ${tone[0]}; color: ${tone[1]};`,
                )}
              >
                {tone[2]} {result.tag}
              </span>
              <h3 id="elig-q" style={s("margin: 0; font-size: 21px; line-height: 1.35; font-weight: 750;")}>
                {result.title}
              </h3>
              <p style={s("margin: 0; font-size: 15px; line-height: 1.6; color: #24343C;")}>{result.text}</p>
              <div style={s("display: flex; flex-wrap: wrap; gap: 10px;")}>
                {result.links.map(([label, href, target]) => {
                  const st = s("display: inline-flex; align-items: center; height: 44px; padding: 0 16px; border-radius: 10px; background: #064F3B; color: #FFFFFF; font-weight: 700; font-size: 14px; text-decoration: none;");
                  if (href.startsWith("#"))
                    return (
                      <a key={label} href={href} onClick={jumpTo(href.slice(1))} style={st}>
                        {label}
                      </a>
                    );
                  if (target)
                    return (
                      <a key={label} href={href} target={target} rel="noopener" style={st}>
                        {label}
                      </a>
                    );
                  return (
                    <Link key={label} href={href} style={st}>
                      {label}
                    </Link>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setA([])}
                  style={s("height: 44px; padding: 0 16px; border-radius: 10px; border: 1px solid #CFDDD5; background: #FFFFFF; color: #24343C; font: 600 14px 'Plus Jakarta Sans', sans-serif; cursor: pointer;")}
                >
                  Start again
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

const ST: [string, string, string, string, string, string][] = [
  ["trial", "Day 0–14", "14-day free trial", "Default offer: 14-day free trial, no card required. Trial features, capacity or external-provider usage may differ from paid plans.", "Full trial functionality", "Payment card is not required"],
  [
    "grace",
    "Next 72 hours",
    "Activation grace",
    "At expiry, operational product functions are restricted. The default activation grace is 72 hours to choose a plan and add payment details.",
    "Billing, support, plan activation and permitted data export",
    "Production operations such as POS transactions, outbound campaigns, workflow execution, payroll runs or live website publishing",
  ],
  ["suspended", "If no plan", "Workspace suspended", "If no plan is activated, workspace operational access is suspended.", "Plan activation, support and permitted export", "Operational use"],
  ["export", "Recovery window", "Export / recovery", "Noxtill may retain workspace data for a limited export/recovery period described in the Privacy Policy before deletion or anonymization.", "Permitted export and plan activation", "Operational use"],
  ["deletion", "After recovery", "Deletion begins", "After recovery: deletion/anonymization may begin, subject to backups, legal holds, payment/tax/security records and lawful retention.", "Lawfully retained records only", "Workspace recovery"],
];
const BARS: Record<string, string> = { trial: "#079A63", grace: "#00C99D", suspended: "#B7791F", export: "#6B7F78", deletion: "#3A4A52" };

export function RefundTimeline() {
  const [stage, setStage] = useState("trial");
  const cur = ST.find((x) => x[0] === stage) ?? ST[0];
  return (
    <section id="timeline" aria-labelledby="tl-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 12px; scroll-margin-top: 90px;")}>
      <h2 id="tl-h" style={s("margin: 0 0 6px; font-size: 28px; font-weight: 800; letter-spacing: -0.02em;")}>
        Trial and subscription timeline
      </h2>
      <p style={s("margin: 0 0 22px; font-size: 15px; color: #4C5B63;")}>Summary of §5.5 and Terms §4. Select a stage for details.</p>
      <ol role="list" style={s("list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0; border-radius: 16px; overflow: hidden; border: 1px solid #D9E8E0;")}>
        {ST.map(([k, when, title]) => {
          const on = stage === k;
          return (
            <li key={k} style={s("display: flex;")}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setStage(k)}
                style={s(
                  `width: 100%; text-align: left; display: flex; flex-direction: column; gap: 6px; padding: 18px 18px 20px; border: 0; border-right: 1px solid #E3EEE8; background: ${on ? "#043F31" : "#FFFFFF"}; color: ${on ? "#FFFFFF" : "#0B1822"}; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; min-height: 132px;`,
                )}
              >
                <span style={s(`display: block; height: 6px; width: 100%; border-radius: 3px; background: ${BARS[k]}; margin-bottom: 8px;`)} />
                <span style={s("font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.85;")}>{when}</span>
                <span style={s("font-size: 17px; font-weight: 800;")}>{title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div role="status" style={s("margin-top: 14px; padding: 18px 20px; border-radius: 14px; background: #ECFBF4; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 12px 28px;")}>
        <div>
          <h3 style={s("margin: 0 0 6px; font-size: 16px; font-weight: 750;")}>{cur[2]}</h3>
          <p style={s("margin: 0; font-size: 15px; line-height: 1.6;")}>{cur[3]}</p>
        </div>
        <div style={s("display: flex; flex-direction: column; gap: 6px;")}>
          <span style={s("font-size: 13px; font-weight: 700; color: #064F3B;")}>Available</span>
          <span style={s("font-size: 15px; line-height: 1.5;")}>{cur[4]}</span>
          <span style={s("font-size: 13px; font-weight: 700; color: #8A2A1E; margin-top: 6px;")}>Not available</span>
          <span style={s("font-size: 15px; line-height: 1.5;")}>{cur[5]}</span>
        </div>
      </div>
    </section>
  );
}

export function MaterialUsage({ intro, rows }: { intro: string; rows: [string, string][] }) {
  const [mu, setMu] = useState("all");
  const all = rows.map(([activity, v]) => ({ activity, yes: v === "Yes" }));
  const shown = all.filter((r) => mu === "all" || (mu === "yes" ? r.yes : !r.yes));
  return (
    <section id="material-usage" aria-labelledby="mu-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 12px; scroll-margin-top: 90px;")}>
      <div style={s("display: flex; flex-wrap: wrap; gap: 10px 24px; align-items: end; justify-content: space-between; margin-bottom: 18px;")}>
        <div>
          <h2 id="mu-h" style={s("margin: 0 0 6px; font-size: 28px; font-weight: 800; letter-spacing: -0.02em;")}>
            Material Product Usage
          </h2>
          <p style={s("margin: 0; font-size: 15px; color: #3A4A52; max-width: 70ch;")}>{intro}</p>
        </div>
        <div role="group" aria-label="Filter activities" style={s("display: flex; gap: 6px;")} data-noprint="true">
          {(
            [
              ["all", "All"],
              ["yes", "Material"],
              ["no", "Not material"],
            ] as const
          ).map(([k, label]) => {
            const on = mu === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => setMu(k)}
                style={s(
                  `height: 40px; padding: 0 14px; border-radius: 999px; border: 1px solid ${on ? "#064F3B" : "#CFDDD5"}; background: ${on ? "#064F3B" : "#FFFFFF"}; color: ${on ? "#FFFFFF" : "#24343C"}; font: 700 14px 'Plus Jakarta Sans', sans-serif; cursor: pointer;`,
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={s("overflow-x: auto; border: 1px solid #D9E8E0; border-radius: 16px;")}>
        <table style={s("width: 100%; border-collapse: collapse; font-size: 15px;")}>
          <caption style={s("text-align: left; padding: 12px 18px; font-size: 13px; color: #4C5B63; border-bottom: 1px solid #D9E8E0;")}>
            Activities and whether they normally end eligibility for the voluntary 7-day unused-service refund (§5.4)
          </caption>
          <thead>
            <tr style={s("background: #F7FAF8;")}>
              <th scope="col" style={s("text-align: left; padding: 12px 18px; font-weight: 700;")}>
                Activity
              </th>
              <th scope="col" style={s("text-align: left; padding: 12px 18px; font-weight: 700; width: 210px;")}>
                Material usage?
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.activity} style={s("border-top: 1px solid #E3EEE8;")}>
                <th scope="row" style={s("text-align: left; padding: 13px 18px; font-weight: 500; line-height: 1.45;")}>
                  {r.activity}
                </th>
                <td style={s("padding: 13px 18px;")}>
                  <span
                    style={s(
                      `display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 8px; font-size: 13px; font-weight: 800; background: ${r.yes ? "#FDE7E4" : "#DDF6EA"}; color: ${r.yes ? "#8A2A1E" : "#04573C"};`,
                    )}
                  >
                    {r.yes ? "●" : "○"} {r.yes ? "Yes — ends eligibility" : "No — not by itself"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PaddleRegions({ regions }: { regions: { key: string; region: string; period: string }[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <>
      {regions.map((r) => {
        const o = !!open[r.key];
        return (
          <div key={r.key} style={s("border: 1px solid #D9E8E0; border-radius: 12px;")}>
            <h4 style={s("margin: 0;")}>
              <button
                type="button"
                id={`pr-${r.key}`}
                aria-expanded={o}
                aria-controls={`pp-${r.key}`}
                onClick={() => setOpen({ ...open, [r.key]: !o })}
                style={s(
                  "width: 100%; min-height: 52px; display: flex; gap: 12px; align-items: center; padding: 12px 16px; border: 0; background: transparent; text-align: left; cursor: pointer; font: 700 15px 'Plus Jakarta Sans', sans-serif; color: #0B1822;",
                )}
              >
                <span style={s("flex: 1;")}>{r.region}</span>
                <span style={s("font-size: 14px; color: #064F3B;")}>{r.period}</span>
                <span aria-hidden="true" style={s("width: 14px;")}>
                  {o ? "−" : "+"}
                </span>
              </button>
            </h4>
            <div id={`pp-${r.key}`} role="region" aria-labelledby={`pr-${r.key}`} hidden={!o} data-panel="true" style={s("padding: 0 16px 14px; font-size: 14px; line-height: 1.6; color: #24343C;")}>
              Paddle describes a {r.period} right in specified circumstances for buyers in {r.region}, subject to Paddle’s conditions. Check Paddle’s live Refund Policy and Buyer Terms for current eligibility before relying on this summary.
            </div>
          </div>
        );
      })}
    </>
  );
}
