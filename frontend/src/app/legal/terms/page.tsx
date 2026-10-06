import { LegalShell } from "@/components/site/legal/legal-shell";
import { Breadcrumb, CrossLinks, HOME, LEGAL, A } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { PolicyBody } from "@/components/site/legal/policy-body";
import { PolicyLayout } from "@/components/site/legal/policy-layout";
import { JumpLink } from "@/components/site/legal/jump-link";
import { s } from "@/components/site/legal/s";
import { META_DOC, NOX, legalHref, legalMetadata, visibleSections } from "@/lib/marketing/legal/nox";

const ROUTE = "/legal/terms";
export const metadata = legalMetadata(ROUTE);

export default function TermsPage() {
  const secs = NOX.terms.sections;
  const sections = visibleSections(
    secs.map((x) =>
      x.movedTo
        ? {
            ...x,
            blocks: [
              {
                t: "p",
                tier: "public" as const,
                isP: true,
                x: `This clause is set out in the Product & Service-Specific Terms, Schedule ${x.movedTo.n} — ${x.movedTo.title}, which supplements these Terms for the modules concerned: noxtill.com/legal/product-terms#${x.movedTo.key}.`,
              },
            ],
          }
        : x,
    ),
  );
  const toc = secs.map((x) => ({ id: x.id, num: x.num, title: x.title })).concat([{ id: "t-module-schedules", num: "§", title: "Product-Specific Terms" }]);
  const ref = (n: number) => secs.find((x) => x.num === String(n));
  const k = (n: number, title: string, text: string) => {
    const sec = ref(n);
    return { ref: `§ ${n} · ${sec ? sec.title : ""}`, title, text, id: sec ? sec.id : "" };
  };
  const keyTerms = [
    k(4, "14-day free trial, no card", "Unless a specific offer states otherwise. Trial access is temporary and may be limited to prevent abuse."),
    k(4, "72-hour activation grace", "After the trial, sign in to choose a plan, pay, contact support and export — but production operations stop."),
    k(5, "Auto-renewal; cancel anytime", "Cancellation stops future renewal at the end of the paid period. No prorated refund unless law or the Refund Policy says so."),
    k(6, "Paddle as Merchant of Record", "Where checkout shows Paddle, Paddle handles payment, taxes, receipts and certain refunds; Noxtill provides the software."),
    k(9, "You keep your Customer Content", "Noxtill processes it only as needed to provide, secure, support and improve the contracted Service."),
    k(11, "AI output needs review", "AI can be wrong. It is never proof that a payment settled, stock exists or an external action succeeded."),
    k(31, "Arizona law, mandatory rights preserved", "Recommended default for the software relationship; consumer rights that cannot be waived still apply."),
    k(24, "Suspension for abuse or risk", "Noxtill may restrict accounts for fraud, spam, security threats or AUP violations, with notice where appropriate."),
  ];
  const lifecycle = [
    { n: 1, title: "14-day free trial", text: "No payment card required under the default offer.", color: "#079A63" },
    { n: 2, title: "72-hour activation grace", text: "Billing, plan activation, support and permitted export only.", color: "#00C99D" },
    { n: 3, title: "Paid subscription", text: "Renews automatically until cancelled.", color: "#064F3B" },
    { n: 4, title: "Suspended if not activated", text: "Operational workspace access is suspended.", color: "#B7791F" },
    { n: 5, title: "Export / recovery period", text: "Limited period described in the Privacy Policy before deletion.", color: "#4C5B63" },
  ];
  const related = [
    { href: legalHref("privacy"), label: "Privacy Policy", desc: "How Noxtill handles personal data as a controller." },
    { href: legalHref("refunds"), label: "Refund policy", desc: "7-day unused-service refunds, Material Product Usage and mandatory rights." },
    { href: legalHref("aup"), label: "Acceptable use", desc: "Prohibited and restricted uses of the platform." },
    { href: legalHref("messaging"), label: "Messaging consent", desc: "WhatsApp, SMS, email and call consent rules." },
    { href: legalHref("ai"), label: "AI transparency", desc: "What AI can do, approval tiers and limits." },
    { href: legalHref("dpa"), label: "Data Processing Addendum", desc: "Processor commitments for Customer Content." },
    { href: legalHref("security"), label: "Security", desc: "Tenant isolation, access control and incident response." },
  ];
  const dt = s("color: #44F0B0; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;");

  return (
    <LegalShell route={ROUTE} printTitle="Terms of Service">
      <section aria-labelledby="terms-h1" style={s("background: linear-gradient(180deg, #ECFBF4 0%, #FFFFFF 100%); border-bottom: 1px solid #E3EEE8;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 44px;")}>
          <Breadcrumb items={[HOME, LEGAL, { label: "Terms of Service" }]} />
          <div style={s("display: flex; flex-wrap: wrap; align-items: center; gap: 32px; margin-top: 28px;")}>
            <div style={s("flex: 999 1 520px; min-width: 0; display: flex; flex-direction: column; gap: 18px;")}>
              <span style={s("font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #067A50;")}>Commercial agreement</span>
              <h1 id="terms-h1" style={s("margin: 0; font-size: clamp(38px, 5vw, 58px); line-height: 1.05; font-weight: 800; letter-spacing: -0.03em; color: #0B1822;")}>
                Terms of Service
              </h1>
              <p style={s("margin: 0; font-size: 19px; line-height: 1.6; color: #2A3A42; max-width: 62ch; text-wrap: pretty;")}>
                The agreement between your business and Noxtill LLC for accounts, subscriptions, AI features, integrations, messaging, payments and business data across the Noxtill Business Operating System.
              </p>
              <PolicyMeta doc={META_DOC} policy="terms" />
            </div>
            <div aria-hidden="true" style={s("flex: 1 1 200px; display: flex; justify-content: center;")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/legal/noxtill-logo.png" alt="" width={200} height={200} style={s("width: 200px; height: 200px; border-radius: 44px; box-shadow: 0 30px 60px -20px rgba(4,63,49,0.45); opacity: 0.96;")} />
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="key-terms-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 8px;")}>
        <div style={s("display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 24px; margin-bottom: 20px;")}>
          <h2 id="key-terms-h" style={s("margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
            Key commercial terms
          </h2>
          <p style={s("margin: 0; font-size: 14px; color: #4C5B63;")}>
            <strong style={s("color: #0B1822;")}>Summary only.</strong> The numbered clauses below are the binding terms.
          </p>
        </div>
        <div style={s("display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px;")}>
          {keyTerms.map((kt) => (
            <JumpLink
              key={kt.title}
              id={kt.id}
              className="h-card"
              style={s("display: flex; flex-direction: column; gap: 8px; padding: 20px; border: 1px solid #BFE8D3; border-radius: 16px; background: #FFFFFF; text-decoration: none; color: #0B1822;")}
            >
              <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; color: #067A50;")}>{kt.ref}</span>
              <span style={s("font-size: 18px; font-weight: 750; letter-spacing: -0.01em;")}>{kt.title}</span>
              <span style={s("font-size: 15px; line-height: 1.55; color: #3A4A52; text-wrap: pretty;")}>{kt.text}</span>
            </JumpLink>
          ))}
        </div>
        <div style={s("margin-top: 28px; padding: 22px 24px; border-radius: 16px; background: #F7FAF8; border: 1px solid #E3EEE8;")}>
          <h3 style={s("margin: 0 0 16px; font-size: 16px; font-weight: 750;")}>
            Subscription lifecycle <span style={s("font-weight: 500; color: #4C5B63;")}>— summary of clauses 4, 5 and 25</span>
          </h3>
          <ol style={s("list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px;")}>
            {lifecycle.map((st) => (
              <li
                key={st.n}
                style={s(`display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border-radius: 12px; background: #FFFFFF; border: 1px solid #D9E8E0; border-top: 4px solid ${st.color};`)}
              >
                <span style={s("font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #4C5B63;")}>Step {st.n}</span>
                <span style={s("font-size: 16px; font-weight: 750;")}>{st.title}</span>
                <span style={s("font-size: 14px; line-height: 1.5; color: #3A4A52;")}>{st.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <PolicyLayout items={toc} variant="terms" navLabel="Terms of Service contents" heading="Contents" drawerId="drawer-h" padding="40px 24px 64px">
        <article aria-labelledby="terms-h1" style={s("flex: 999 1 560px; min-width: 0;")}>
          <div style={s("display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; padding-bottom: 16px;")} data-noprint="true">
            <p style={s("margin: 0; font-size: 15px; color: #3A4A52; max-width: 60ch;")}>
              Provided by Noxtill LLC, Arizona, United States. Read with the <A href={legalHref("privacy")}>Privacy Policy</A>,{" "}
              <A href={legalHref("refunds")}>Refund &amp; Cancellation Policy</A> and <A href={legalHref("aup")}>Acceptable Use Policy</A>.
            </p>
          </div>
          <PolicyBody sections={sections} />

          <section id="t-module-schedules" aria-labelledby="t-module-schedules-h" style={s("scroll-margin-top: 120px; padding: 32px 0 12px; border-top: 1px solid #E3EEE8; margin-top: 12px;")}>
            <h2 id="t-module-schedules-h" style={s("margin: 0 0 10px; font-size: 22px; font-weight: 750; letter-spacing: -0.01em;")}>
              Product &amp; Service-Specific Terms
            </h2>
            <p style={s("margin: 0 0 16px; font-size: 17px; line-height: 1.7; max-width: 74ch;")}>
              {NOX.legal.agreementStatement} Module-specific terms are set out in nine Product Schedules that supplement these Terms.
            </p>
            <div style={s("display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr)); gap: 10px;")}>
              {NOX.productSchedules.map((p) => (
                <A
                  key={p.key}
                  href={`${legalHref("productTerms")}#${p.key}`}
                  className="h-bd"
                  style={s("display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 12px; border: 1px solid #BFE8D3; text-decoration: none; color: #0B1822;")}
                >
                  <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #067A50;")}>Schedule {p.n}</span>
                  <strong style={s("font-size: 15px; color: #064F3B;")}>{p.short}</strong>
                </A>
              ))}
            </div>
          </section>
        </article>
      </PolicyLayout>

      <section aria-labelledby="related-h" style={s("background: #F7FAF8; border-top: 1px solid #E3EEE8;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 56px 24px; display: flex; flex-direction: column; gap: 28px;")}>
          <CrossLinks heading="Policies incorporated into these Terms" links={related} />
          <div style={s("display: flex; flex-wrap: wrap; gap: 10px 24px; font-size: 15px;")} data-noprint="true">
            <span style={s("font-weight: 700; color: #0B1822;")}>Paddle documents:</span>
            <A href="https://www.paddle.com/legal/buyer-terms" target="_blank" style={s("font-weight: 600;")}>
              Paddle Buyer Terms (opens paddle.com)
            </A>
            <A href="https://www.paddle.com/legal/refund-policy" target="_blank" style={s("font-weight: 600;")}>
              Paddle Refund Policy (opens paddle.com)
            </A>
          </div>
        </div>
      </section>

      <section aria-labelledby="legal-contact-h" style={s("background: #064F3B; color: #FFFFFF;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px; display: flex; flex-wrap: wrap; gap: 24px 48px; align-items: flex-start; justify-content: space-between;")}>
          <div style={s("flex: 1 1 360px; display: flex; flex-direction: column; gap: 10px;")}>
            <h2 id="legal-contact-h" style={s("margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
              Legal notices
            </h2>
            <p style={s("margin: 0; font-size: 16px; line-height: 1.6; color: #D7EFE5;")}>Noxtill LLC, 4539 N 22ND ST STE R, Phoenix, AZ 85016, United States</p>
          </div>
          <dl style={s("flex: 1 1 420px; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px 28px; font-size: 15px;")}>
            {[
              ["Legal notices", "legal@noxtill.com", "mailto:legal@noxtill.com"],
              ["Privacy / data rights", "privacy@noxtill.com", "mailto:privacy@noxtill.com"],
              ["Support", "support@noxtill.com", "mailto:support@noxtill.com"],
              ["Phone", "+1 808 998 5302", "tel:+18089985302"],
            ].map(([label, value, href]) => (
              <div key={label}>
                <dt style={dt}>{label}</dt>
                <dd style={s("margin: 4px 0 0;")}>
                  <a href={href} style={s("color: #FFFFFF;")}>
                    {value}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </LegalShell>
  );
}
