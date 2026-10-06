import { LegalShell } from "@/components/site/legal/legal-shell";
import { Breadcrumb, CrossLinks, HOME, LEGAL } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { s } from "@/components/site/legal/s";
import { META_DOC, NOX, legalHref, legalMetadata, paras } from "@/lib/marketing/legal/nox";
import { DnsOptOut } from "./dns-view";

const ROUTE = "/legal/do-not-sell";
export const metadata = legalMetadata(ROUTE);

export default function DoNotSellPage() {
  const p10 = paras(NOX.privacy.sections.find((x) => x.num === "10"));
  const usChoice = NOX.cookies.sections.find((x) => x.title.startsWith("U.S. state"))?.blocks.find((b) => b.tier === "public")?.x ?? "";
  const faq = [
    { q: "Does Noxtill sell personal data?", a: p10[1] || "" },
    { q: "Who can use this page?", a: "Anyone, wherever they live. Your country and region tell us which privacy rules apply to your request; mandatory local rights always prevail." },
    {
      q: "What does opting out change?",
      a: "Advertising and targeting technologies are switched off for this browser, and — when you submit Step 2 — for the records associated with your email. Necessary cookies, service messages and account notices are not affected.",
    },
    { q: "Global Privacy Control (GPC)", a: usChoice },
    { q: "Authorized agents", a: "An authorized agent may submit a request for you. Noxtill may ask the agent for proof of authorization and may ask you to confirm the request directly." },
    {
      q: "Data held by a business that uses Noxtill",
      a: "If your information is in a Noxtill customer’s workspace — for example as their customer or employee — that business controls it. Contact the business directly; Noxtill assists it under the Data Processing Addendum.",
    },
    { q: "Will I be treated differently?", a: "No. Noxtill does not discriminate against anyone for exercising privacy choices." },
  ];
  const related = [
    { href: legalHref("privacy", "p-16-california-and-other-u-s-state-privacy-rights"), label: "Privacy Policy — U.S. state rights", desc: "California and other U.S. state privacy rights (§16)." },
    { href: legalHref("cookies", "preferences"), label: "Cookie settings", desc: "Manage all cookie categories." },
    { href: legalHref("contact", "privacy"), label: "Other privacy requests", desc: "Access, correction, deletion and more." },
    { href: legalHref("dpa"), label: "Data Processing Addendum", desc: "How Noxtill processes customer data." },
  ];
  return (
    <LegalShell route={ROUTE}>
      <section aria-labelledby="dns-h1" style={s("background: #F7FAF8; border-bottom: 1px solid #E3EEE8;")}>
        <div style={s("max-width: 1040px; margin: 0 auto; padding: 28px 24px 40px;")}>
          <Breadcrumb items={[HOME, LEGAL, { label: "Do Not Sell or Share" }]} />
          <h1 id="dns-h1" style={s("margin: 26px 0 14px; font-size: clamp(32px, 4.2vw, 48px); line-height: 1.08; font-weight: 800; letter-spacing: -0.025em; text-wrap: balance;")}>
            Do Not Sell or Share My Personal Information
          </h1>
          <div style={s("display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; padding: 18px 20px; border-radius: 16px; background: #043F31; color: #FFFFFF;")}>
            <span style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #44F0B0;")}>Our position</span>
            <p style={s("margin: 0; flex: 1 1 480px; font-size: 16px; line-height: 1.6;")}>{p10[1] || ""}</p>
          </div>
          <div style={s("margin-top: 22px;")}>
            <PolicyMeta doc={META_DOC} policy="dns" />
          </div>
        </div>
      </section>

      <DnsOptOut policyVersion={NOX.doc.version} />

      <section aria-labelledby="how-h" style={s("max-width: 1040px; margin: 0 auto; padding: 40px 24px 12px;")}>
        <h2 id="how-h" style={s("margin: 0 0 16px; font-size: 24px; font-weight: 800;")}>
          How this works
        </h2>
        <div style={s("display: flex; flex-direction: column; gap: 0; border-top: 1px solid #D9E8E0;")}>
          {faq.map((q) => (
            <div key={q.q} style={s("display: flex; flex-wrap: wrap; gap: 6px 32px; padding: 18px 4px; border-bottom: 1px solid #E3EEE8;")}>
              <h3 style={s("margin: 0; flex: 1 1 260px; font-size: 16px; font-weight: 800;")}>{q.q}</h3>
              <p style={s("margin: 0; flex: 2 1 420px; font-size: 15px; line-height: 1.65; color: #24343C;")}>{q.a}</p>
            </div>
          ))}
        </div>
      </section>
      <section style={s("max-width: 1040px; margin: 0 auto; padding: 40px 24px 64px;")}>
        <CrossLinks heading="Related privacy resources" links={related} />
      </section>
    </LegalShell>
  );
}
