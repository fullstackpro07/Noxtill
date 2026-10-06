import { LegalShell } from "@/components/site/legal/legal-shell";
import { Breadcrumb, CrossLinks, HOME, LEGAL } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { PolicyBody } from "@/components/site/legal/policy-body";
import { s } from "@/components/site/legal/s";
import { META_DOC, NOX, bullets, capitalize, legalHref, legalMetadata, paras, visibleSections } from "@/lib/marketing/legal/nox";
import { AccessibilityForm, SkipLinkDemo } from "./accessibility-form";

const ROUTE = "/legal/accessibility";
export const metadata = legalMetadata(ROUTE);

export default function AccessibilityPage() {
  const S = NOX.accessibility.sections;
  const c = S.find((x) => x.num === "16.3");
  const f = S.find((x) => x.num === "16.4");
  const reqs = bullets(c).map(capitalize);
  const related = [
    { href: legalHref("contact"), label: "Contact", desc: "Other ways to reach Noxtill." },
    { href: legalHref("status"), label: "Status", desc: "Service health and incidents." },
    { href: legalHref("security"), label: "Security", desc: "How Noxtill protects data." },
    { href: legalHref("terms"), label: "Terms of Service", desc: "The agreement for using Noxtill." },
  ];
  const card = s("padding: 24px; border-radius: 16px; border: 3px solid #043F31; display: flex; flex-direction: column; gap: 8px;");
  const kicker = s("margin: 0; font-size: 14px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;");

  return (
    <LegalShell route={ROUTE}>
      <section aria-labelledby="ac-h1" style={s("background: #043F31; color: #FFFFFF;")}>
        <div style={s("max-width: 1040px; margin: 0 auto; padding: 28px 24px 48px;")}>
          <Breadcrumb items={[HOME, LEGAL, { label: "Accessibility Statement" }]} tone="contrast" fontSize={15} />
          <h1 id="ac-h1" style={s("margin: 28px 0 12px; font-size: clamp(36px, 4.6vw, 54px); line-height: 1.06; font-weight: 800; letter-spacing: -0.03em;")}>
            Accessibility Statement
          </h1>
          <p style={s("margin: 0; font-size: clamp(22px, 2.4vw, 28px); font-weight: 700;")}>Noxtill should work for more people.</p>
          <div style={s("margin-top: 24px;")}>
            <PolicyMeta doc={META_DOC} policy="accessibility" dark />
          </div>
        </div>
      </section>

      <section aria-labelledby="st-h" style={s("max-width: 1040px; margin: 0 auto; padding: 40px 24px 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 16px;")}>
        <div style={card}>
          <h2 id="st-h" style={kicker}>
            Target
          </h2>
          <p style={s("margin: 0; font-size: 34px; font-weight: 800; letter-spacing: -0.02em;")}>WCAG 2.2 AA</p>
          <p style={s("margin: 0; font-size: 16px; line-height: 1.6;")}>For the public website and core product interfaces.</p>
        </div>
        <div style={card}>
          <h2 style={kicker}>Current status</h2>
          <p style={s("margin: 0; font-size: 22px; font-weight: 800;")}>Target — conformance not claimed</p>
          <p style={s("margin: 0; font-size: 16px; line-height: 1.6;")}>WCAG 2.2 AA is our design target. Noxtill does not claim conformance for a release until that release has been audited.</p>
        </div>
        <div style={s("padding: 24px; border-radius: 16px; background: #0B1822; color: #FFFFFF; display: flex; flex-direction: column; gap: 10px;")} data-noprint="true">
          <h2 style={kicker}>Try it</h2>
          <p style={s("margin: 0; font-size: 16px; line-height: 1.6;")}>
            Press <kbd style={s("font-family: 'JetBrains Mono', monospace; padding: 2px 6px; border-radius: 5px; background: #FFFFFF; color: #0B1822;")}>Tab</kbd> at the top of any Noxtill page to reveal a “Skip to content” link.
          </p>
          <SkipLinkDemo />
        </div>
      </section>

      <section aria-labelledby="req-h" style={s("max-width: 1040px; margin: 0 auto; padding: 40px 24px 12px;")}>
        <h2 id="req-h" style={s("margin: 0 0 6px; font-size: 26px; font-weight: 800;")}>
          What we design for
        </h2>
        <p style={s("margin: 0 0 18px; font-size: 16px; line-height: 1.6;")}>{paras(c).join(" ")}</p>
        <ul style={s("list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 0; border-top: 2px solid #043F31;")}>
          {reqs.map((r) => (
            <li key={r} style={s("display: flex; gap: 14px; align-items: flex-start; padding: 16px 6px; border-bottom: 1px solid #C9D6CF; font-size: 17px; line-height: 1.5;")}>
              <span
                aria-hidden="true"
                style={s("flex-shrink: 0; width: 26px; height: 26px; border-radius: 6px; background: #043F31; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;")}
              >
                ✓
              </span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="kl-h" style={s("max-width: 1040px; margin: 0 auto; padding: 40px 24px 12px;")}>
        <h2 id="kl-h" style={s("margin: 0 0 12px; font-size: 26px; font-weight: 800;")}>
          Known limitations
        </h2>
        <div style={s("padding: 20px; border-radius: 14px; border: 2px dashed #6B7F78; font-size: 16px; line-height: 1.6;")}>
          No known limitations are published yet. Barriers found through audits or your reports will be listed here, with alternative ways to complete the task.
        </div>
      </section>

      <section id="feedback" aria-labelledby="fb-h" style={s("max-width: 1040px; margin: 0 auto; padding: 40px 24px 12px; scroll-margin-top: 90px;")} data-noprint="true">
        <div style={s("padding: 26px; border-radius: 18px; background: #F2F7F4; border: 2px solid #043F31;")}>
          <h2 id="fb-h" tabIndex={-1} style={s("margin: 0 0 6px; font-size: 24px; font-weight: 800; outline: none;")}>
            Report an accessibility barrier
          </h2>
          <p style={s("margin: 0 0 18px; font-size: 16px; line-height: 1.6;")}>
            {paras(f).join(" ")} Reports go to <a href="mailto:support@noxtill.com">support@noxtill.com</a>. You don’t need to share any health information.
          </p>
          <AccessibilityForm />
        </div>
      </section>

      <section aria-labelledby="acc-full" style={s("max-width: 1040px; margin: 0 auto; padding: 48px 24px 24px;")}>
        <h2 id="acc-full" style={s("margin: 0 0 8px; font-size: 14px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;")}>
          Statement text
        </h2>
        <PolicyBody sections={visibleSections(S)} compact />
      </section>
      <section style={s("max-width: 1040px; margin: 0 auto; padding: 24px 24px 64px;")}>
        <CrossLinks heading="Related" links={related} />
      </section>
    </LegalShell>
  );
}
