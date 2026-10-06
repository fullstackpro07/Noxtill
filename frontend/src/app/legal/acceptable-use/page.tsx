import { LegalShell } from "@/components/site/legal/legal-shell";
import { A, Breadcrumb, CrossLinksBand, HOME, LEGAL, KickerH2 } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { PolicyBody } from "@/components/site/legal/policy-body";
import { s } from "@/components/site/legal/s";
import { META_DOC, NOX, capitalize, legalHref, legalMetadata, visibleSections } from "@/lib/marketing/legal/nox";
import { AupGuide } from "./aup-guide";

const ROUTE = "/legal/acceptable-use";
export const metadata = legalMetadata(ROUTE);

const ALLOWED: [string, string, string][] = [
  ["Legitimate business operations and configured customer-facing workflows", "Commerce", "Terms §2, §8"],
  ["Service messages, and marketing backed by consent evidence and a working opt-out", "Messaging", "Messaging §8.4–8.6, §8.12"],
  ["AI that summarizes, drafts, extracts and recommends within your permissions", "AI", "AI Transparency §9.5"],
  ["Neutral review requests with material connections disclosed", "Reviews", "Messaging §8.13"],
  ["Content you have the rights and consents to upload and process", "Content", "Terms §9"],
  ["Documented APIs used within authorization and quotas", "APIs", "Terms §8"],
  ["Responsible vulnerability reports through the reporting route", "Security", "Security — Vulnerability management"],
];
const RESTRICTED: [string, string, string][] = [
  ["Regulated goods or services — only where the required licences exist", "Commerce", "AUP §7.3"],
  ["High-risk automated marketing texts/calls — appropriate consent evidence required first", "Messaging", "Messaging §8.8"],
  ["Call recording and transcription — legally required disclosures and consents configured", "Messaging", "Terms §13"],
  ["High-impact AI actions such as payouts, refunds, payroll or vendor awards — approval required", "AI", "AI Transparency §9.8"],
  ["Review incentives — never conditioned on sentiment where prohibited; connections disclosed", "Reviews", "Terms §19"],
  ["Security testing — only with authorization; destructive testing prohibited", "Security", "Security — Vulnerability management"],
  ["Reselling access — only under an authorized agreement", "APIs", "Terms §8"],
];
const PROHIBITED_TOPICS = ["Commerce", "Security", "Security", "Messaging", "AI", "Reviews", "Commerce", "AI", "Content", "Content", "APIs", "APIs"];
const STEPS = ["Warn", "Throttle", "Disable a workflow/integration", "Quarantine data", "Block outbound messaging", "Remove content", "Suspend a feature", "Suspend the workspace", "Terminate access"];

export default function AcceptableUsePage() {
  const S = NOX.aup.sections;
  const list = (S.find((x) => x.num === "7.3")?.blocks.find((b) => b.isUl)?.items ?? []).map((x) => x.replace(/;$|\.$|; and$/, ""));
  const prohibited = list.map((x, i) => ({ text: capitalize(x), topic: PROHIBITED_TOPICS[i] || "Content", src: "AUP §7.3" }));
  const toItems = (arr: [string, string, string][]) => arr.map(([text, topic, src]) => ({ text, topic, src }));
  const appeal = S.find((x) => x.num === "7.4")?.blocks[1]?.x ?? "";
  const related = [
    { href: legalHref("terms", "t-24-suspension"), label: "Terms of Service", desc: "Suspension and termination (§24–25)." },
    { href: legalHref("messaging"), label: "Messaging & Consent", desc: "Consent, opt-out and sender identity rules." },
    { href: legalHref("ai"), label: "AI Transparency", desc: "Approval tiers and AI limits." },
    { href: legalHref("security"), label: "Security", desc: "Vulnerability reporting and controls." },
  ];
  const btn = "align-self: flex-start; display: inline-flex; align-items: center; height: 44px; padding: 0 16px; border-radius: 10px; font-weight: 700; font-size: 14px; text-decoration: none;";

  return (
    <LegalShell route={ROUTE} printTitle="Acceptable Use Policy">
      <section aria-labelledby="aup-h1" style={s("background: radial-gradient(120% 140% at 85% 0%, #075C45 0%, #043F31 55%, #032E24 100%); color: #FFFFFF;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 52px;")}>
          <Breadcrumb items={[HOME, LEGAL, { label: "Acceptable Use Policy" }]} tone="dark" />
          <div style={s("margin-top: 30px; display: flex; flex-direction: column; gap: 14px; max-width: 820px;")}>
            <h1 id="aup-h1" style={s("margin: 0; font-size: clamp(36px, 4.6vw, 54px); line-height: 1.06; font-weight: 800; letter-spacing: -0.03em;")}>
              Acceptable Use Policy
            </h1>
            <p style={s("margin: 0; font-size: clamp(22px, 2.6vw, 30px); font-weight: 800; color: #44F0B0; letter-spacing: -0.01em;")}>Build real business. Not abuse.</p>
            <p style={s("margin: 0; font-size: 17px; line-height: 1.6; color: #D7EFE5; max-width: 62ch;")}>
              What Noxtill may prohibit, restrict or require additional approval for across messaging, AI, commerce, security, content, reviews and APIs — and how enforcement and appeals work.
            </p>
          </div>
          <div style={s("margin-top: 26px;")}>
            <PolicyMeta doc={META_DOC} policy="aup" dark />
          </div>
        </div>
      </section>

      <AupGuide allowed={toItems(ALLOWED)} restricted={toItems(RESTRICTED)} prohibited={prohibited} />

      <section aria-labelledby="ladder-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 12px;")}>
        <h2 id="ladder-h" style={s("margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
          Enforcement stages
        </h2>
        <p style={s("margin: 0 0 20px; font-size: 15px; color: #3A4A52; max-width: 72ch;")}>
          From §7.4. Measures are not always applied in order: immediate action is allowed for serious security threats, fraud, illegal activity, provider directives or likely harm.
        </p>
        <ol style={s("list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; align-items: end;")}>
          {STEPS.map((label, i) => {
            const bg = i < 3 ? "#ECFBF4" : i < 6 ? "#FFF1D6" : "#FDE7E4";
            const fg = i < 3 ? "#04573C" : i < 6 ? "#6E4400" : "#8A2A1E";
            return (
              <li key={label} style={s(`display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; padding: 12px; border-radius: 12px; background: ${bg}; color: ${fg}; min-height: ${74 + i * 12}px;`)}>
                <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; opacity: 0.85;")}>{String(i + 1).padStart(2, "0")}</span>
                <span style={s("font-size: 14px; font-weight: 700; line-height: 1.3;")}>{label}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-label="Appeals and reporting" style={s("max-width: 1240px; margin: 0 auto; padding: 36px 24px 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 16px;")}>
        <div style={s("padding: 22px; border-radius: 18px; background: #ECFBF4; display: flex; flex-direction: column; gap: 10px;")}>
          <h2 style={s("margin: 0; font-size: 19px; font-weight: 800;")}>Appeal an enforcement action</h2>
          <p style={s("margin: 0; font-size: 15px; line-height: 1.6;")}>{appeal}</p>
          <A href="/contact#support" style={s(`${btn} background: #064F3B; color: #FFFFFF;`)}>
            Contact support to appeal
          </A>
        </div>
        <div style={s("padding: 22px; border-radius: 18px; border: 1px solid #D9E8E0; display: flex; flex-direction: column; gap: 10px;")}>
          <h2 style={s("margin: 0; font-size: 19px; font-weight: 800;")}>Report abuse</h2>
          <p style={s("margin: 0; font-size: 15px; line-height: 1.6;")}>
            Seen spam, phishing, fake reviews or other misuse sent through Noxtill? Tell support which business, channel and time — never include passwords or payment-card details.
          </p>
          <A href="/contact#support" style={s(`${btn} border: 1px solid #9FD9BD; color: #064F3B;`)}>
            Report abuse
          </A>
        </div>
        <div style={s("padding: 22px; border-radius: 18px; background: #043F31; color: #FFFFFF; display: flex; flex-direction: column; gap: 10px;")}>
          <h2 style={s("margin: 0; font-size: 19px; font-weight: 800;")}>API and security abuse</h2>
          <p style={s("margin: 0; font-size: 15px; line-height: 1.6; color: #D7EFE5;")}>
            Tenant enumeration, stolen API keys, quota bypass, unauthorized penetration testing and harmful loops are prohibited. Report vulnerabilities through the responsible-reporting route.
          </p>
          <A href="/trust/security#s-vulnerability-management" style={s("align-self: flex-start; color: #44F0B0; font-weight: 700; font-size: 15px;")}>
            Vulnerability reporting →
          </A>
        </div>
      </section>

      <section aria-labelledby="aup-full" style={s("max-width: 920px; margin: 0 auto; padding: 56px 24px 64px;")}>
        <KickerH2 id="aup-full">Full policy text</KickerH2>
        <PolicyBody sections={visibleSections(S)} />
      </section>
      <CrossLinksBand heading="Related policies" links={related} />
    </LegalShell>
  );
}
