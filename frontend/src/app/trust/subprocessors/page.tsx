import { LegalShell } from "@/components/site/legal/legal-shell";
import { A, Breadcrumb, CrossLinksBand, HOME, TRUST, KickerH2 } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { PolicyBody } from "@/components/site/legal/policy-body";
import { s } from "@/components/site/legal/s";
import { META_DOC, NOX, legalHref, legalMetadata, trimItem, visibleSections } from "@/lib/marketing/legal/nox";
import { SubprocessorRegister, SubscribeButton, SubscribeForm } from "./subprocessors-view";

const ROUTE = "/trust/subprocessors";
export const metadata = legalMetadata(ROUTE);

export default function SubprocessorsPage() {
  const S = NOX.subprocessors.sections;
  const notice = (S.find((x) => x.num === "12.5")?.blocks ?? []).filter((b) => b.tier === "public").map((b) => b.x ?? "");
  const changes = NOX.subprocessorChanges ?? [];
  const related = [
    { href: legalHref("dpa", "annex-iii"), label: "Data Processing Addendum", desc: "Subprocessor authorization and objection rights." },
    { href: legalHref("privacy", "p-11-subprocessors-and-independent-controllers"), label: "Privacy Policy", desc: "Subprocessors and independent controllers (§11)." },
    { href: legalHref("security", "s-vendor-risk"), label: "Security", desc: "Vendor risk management." },
  ];
  return (
    <LegalShell route={ROUTE}>
      <section aria-labelledby="sp-h1" style={s("border-bottom: 1px solid #E3EEE8;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 36px;")}>
          <Breadcrumb items={[HOME, TRUST, { label: "Subprocessors" }]} />
          <div style={s("margin-top: 24px; display: flex; flex-wrap: wrap; gap: 20px 48px; align-items: flex-end; justify-content: space-between;")}>
            <div style={s("flex: 1 1 520px; display: flex; flex-direction: column; gap: 12px;")}>
              <h1 id="sp-h1" style={s("margin: 0; font-size: clamp(36px, 4.6vw, 54px); line-height: 1.06; font-weight: 800; letter-spacing: -0.03em;")}>
                Subprocessors
              </h1>
              <p style={s("margin: 0; font-size: clamp(20px, 2.2vw, 26px); font-weight: 700; color: #064F3B;")}>Who helps us provide Noxtill.</p>
              <p style={s("margin: 0; font-size: 16px; line-height: 1.6; color: #2A3A42; max-width: 66ch;")}>
                This register is incorporated into the <A href="/legal/dpa#annex-iii">Data Processing Addendum as Annex III</A>. Merchant-of-Record and customer-selected integrations are disclosed separately because their legal roles differ.
              </p>
            </div>
            <SubscribeButton />
          </div>
          <div style={s("margin-top: 22px;")}>
            <PolicyMeta doc={META_DOC} policy="subprocessors" />
          </div>
        </div>
      </section>

      <SubprocessorRegister register={NOX.subprocessorRegister ?? []} fieldList={NOX.subprocessors.fields.map(trimItem).join(", ")} />

      <section aria-labelledby="roles-h" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px;")}>
        <h2 id="roles-h" style={s("margin: 0 0 16px; font-size: 24px; font-weight: 800;")}>
          How provider roles are classified
        </h2>
        <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 12px;")}>
          {NOX.subprocessors.roles.rows.map(([k, v], i) => (
            <div key={k} style={s(`padding: 20px; border-radius: 16px; border: 1px solid #D9E8E0; background: ${i === 0 ? "#ECFBF4" : "#FFFFFF"}; display: flex; flex-direction: column; gap: 8px;`)}>
              <h3 style={s("margin: 0; font-size: 17px; font-weight: 800;")}>{k}</h3>
              <p style={s("margin: 0; font-size: 15px; line-height: 1.55; color: #24343C;")}>{v}</p>
            </div>
          ))}
        </div>
        <div style={s("margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 12px;")}>
          <div style={s("padding: 20px; border-radius: 16px; background: #F7FAF8; border: 1px solid #E3EEE8;")}>
            <h3 style={s("margin: 0 0 8px; font-size: 17px; font-weight: 800;")}>Independent controllers</h3>
            <p style={s("margin: 0; font-size: 15px; line-height: 1.6;")}>
              <strong>Paddle</strong> — where checkout identifies Paddle as Merchant of Record or authorized reseller, Paddle processes payment, applicable transaction taxes, buyer receipts and certain cancellation/refund workflows under its own buyer
              terms. It is not listed as a Noxtill subprocessor.{" "}
              <A href="https://www.paddle.com/legal/buyer-terms" target="_blank">
                Paddle Buyer Terms
              </A>
            </p>
          </div>
          <div style={s("padding: 20px; border-radius: 16px; background: #F7FAF8; border: 1px solid #E3EEE8;")}>
            <h3 style={s("margin: 0 0 8px; font-size: 17px; font-weight: 800;")}>Customer-selected integrations</h3>
            <p style={s("margin: 0; font-size: 15px; line-height: 1.6;")}>
              Integrations you connect are governed by your agreement with that provider and identified in the Integrations area of your workspace. See the <A href="/legal#module-integrations">Integrations legal schedule</A>.
            </p>
          </div>
        </div>
      </section>

      <section id="subscribe" aria-labelledby="sub-h" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px; scroll-margin-top: 90px;")} data-noprint="true">
        <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: 24px; padding: 26px; border-radius: 20px; background: #043F31; color: #FFFFFF;")}>
          <div style={s("display: flex; flex-direction: column; gap: 10px;")}>
            <h2 id="sub-h" style={s("margin: 0; font-size: 22px; font-weight: 800;")}>
              Subscribe to subprocessor changes
            </h2>
            {notice.map((p, i) => (
              <p key={i} style={s("margin: 0; font-size: 15px; line-height: 1.6; color: #D7EFE5;")}>
                {p}
              </p>
            ))}
          </div>
          <SubscribeForm />
        </div>
      </section>

      <section aria-labelledby="hist-h" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px;")}>
        <h2 id="hist-h" style={s("margin: 0 0 14px; font-size: 22px; font-weight: 800;")}>
          Change history
        </h2>
        <ol style={s("list-style: none; margin: 0; padding: 0; border: 1px solid #D9E8E0; border-radius: 14px;")}>
          {changes.map((c) => (
            <li key={`${c.date}-${c.text}`} style={s("padding: 14px 18px; border-top: 1px solid #E3EEE8; display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 15px;")}>
              <time style={s("font-weight: 700; min-width: 130px;")}>{c.date}</time>
              <span>{c.text}</span>
            </li>
          ))}
          {changes.length === 0 ? (
            <li style={s("padding: 18px; font-size: 15px; color: #3A4A52;")}>No changes recorded yet. Additions, removals and material changes will be listed here with their effective date.</li>
          ) : null}
        </ol>
      </section>

      <section aria-labelledby="sp-full" style={s("max-width: 920px; margin: 0 auto; padding: 48px 24px 64px;")}>
        <KickerH2 id="sp-full">Policy text</KickerH2>
        <PolicyBody sections={visibleSections(S.filter((x) => x.num !== "12.4"))} compact />
      </section>
      <CrossLinksBand heading="Related documents" links={related} />
    </LegalShell>
  );
}
