import { LegalShell } from "@/components/site/legal/legal-shell";
import { A, Breadcrumb, CrossLinksBand, HOME, LEGAL, KickerH2 } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { PolicyBody } from "@/components/site/legal/policy-body";
import { JumpLink } from "@/components/site/legal/jump-link";
import { s } from "@/components/site/legal/s";
import { META_DOC, NOX, legalHref, legalMetadata, visibleSections } from "@/lib/marketing/legal/nox";
import { MaterialUsage, PaddleRegions, RefundEligibility, RefundTimeline } from "./refunds-view";

const ROUTE = "/legal/refunds";
export const metadata = legalMetadata(ROUTE);

export default function RefundsPage() {
  const S = NOX.refunds.sections;
  const sec = (n: string) => S.find((x) => x.num === n);
  const t6 = NOX.terms.sections.find((x) => x.num === "6");
  const chips = S.filter((x) => x.blocks.some((b) => b.tier === "public")).map((x) => ({ label: `${x.num} ${x.title}`, id: x.id }));
  const related = [
    { href: legalHref("terms", "t-5-paid-subscriptions-and-renewal"), label: "Subscriptions and renewal", desc: "Terms §5 — plans, renewal and cancellation timing." },
    { href: legalHref("terms", "t-6-paddle-merchant-of-record"), label: "Paddle Merchant of Record", desc: "Terms §6 — who handles your transaction." },
    { href: "https://www.paddle.com/legal/buyer-terms", label: "Paddle Buyer Terms", desc: "Paddle’s terms for the buyer transaction." },
    { href: legalHref("contact", "support"), label: "Billing support", desc: "Ask about a charge, refund or cancellation." },
  ];
  const btn = "display: inline-flex; align-items: center; height: 46px; padding: 0 20px; border-radius: 11px; font-weight: 700; font-size: 15px; text-decoration: none;";
  const sbtn = "display: inline-flex; align-items: center; height: 44px; padding: 0 16px; border-radius: 10px; font-weight: 700; font-size: 14px; text-decoration: none;";

  return (
    <LegalShell route={ROUTE} printTitle="Refund & Cancellation Policy">
      <section aria-labelledby="refund-h1" style={s("background: #F7FAF8; border-bottom: 1px solid #E3EEE8;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 44px;")}>
          <Breadcrumb items={[HOME, LEGAL, { label: "Refund & Cancellation Policy" }]} />
          <div style={s("margin-top: 26px; display: flex; flex-direction: column; gap: 16px; max-width: 860px;")}>
            <h1 id="refund-h1" style={s("margin: 0; font-size: clamp(36px, 4.6vw, 54px); line-height: 1.06; font-weight: 800; letter-spacing: -0.03em;")}>
              Refund &amp; Cancellation Policy
            </h1>
            <p style={s("margin: 0; font-size: clamp(20px, 2.2vw, 26px); line-height: 1.35; font-weight: 700; color: #064F3B; text-wrap: balance;")}>
              Clear cancellation. Strict refunds. Mandatory rights respected.
            </p>
            <div style={s("display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px;")} data-noprint="true">
              <JumpLink id="r-5-6-cancellation" style={s(`${btn} background: #064F3B; color: #FFFFFF;`)}>
                Cancel subscription
              </JumpLink>
              <A href="/contact#support" style={s(`${btn} background: #FFFFFF; color: #064F3B; border: 1px solid #9FD9BD;`)}>
                Request refund
              </A>
            </div>
          </div>
          <div style={s("margin-top: 26px;")}>
            <PolicyMeta doc={META_DOC} policy="refunds" />
          </div>
        </div>
      </section>

      <section aria-label="Mandatory rights" style={s("max-width: 1240px; margin: 0 auto; padding: 32px 24px 0;")}>
        <div style={s("display: flex; flex-wrap: wrap; gap: 16px 28px; align-items: center; padding: 22px 24px; border-radius: 18px; background: #043F31; color: #FFFFFF;")}>
          <span style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #43F0B0; padding: 6px 10px; border: 1px solid rgba(68,240,176,0.5); border-radius: 8px;")}>
            Always applies
          </span>
          <p style={s("margin: 0; flex: 1 1 420px; font-size: 17px; line-height: 1.6; font-weight: 500;")}>{sec("5.3")?.blocks[1]?.x}</p>
        </div>
      </section>

      <RefundEligibility />
      <RefundTimeline />
      <MaterialUsage intro={sec("5.4")?.blocks[0]?.x ?? ""} rows={NOX.refunds.usage.rows as [string, string][]} />

      <section aria-labelledby="paddle-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 12px;")}>
        <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 24px;")}>
          <div style={s("padding: 24px; border-radius: 18px; border: 1px solid #BFE8D3; background: #FFFFFF; display: flex; flex-direction: column; gap: 12px;")}>
            <h2 id="paddle-h" style={s("margin: 0; font-size: 22px; font-weight: 800;")}>
              Paddle and mandatory rights
            </h2>
            {(t6?.blocks ?? []).map((b, i) => (
              <p key={i} style={s("margin: 0; font-size: 16px; line-height: 1.65;")}>
                {b.x}
              </p>
            ))}
            <p style={s("margin: 0; font-size: 13px; color: #4C5B63;")}>From Terms of Service §6 (Paddle Merchant of Record).</p>
            <div style={s("display: flex; flex-wrap: wrap; gap: 10px;")}>
              <A href="https://www.paddle.com/legal/refund-policy" target="_blank" style={s(`${sbtn} background: #064F3B; color: #FFFFFF;`)}>
                Paddle Refund Policy (live)
              </A>
              <A href="https://www.paddle.com/legal/buyer-terms" target="_blank" style={s(`${sbtn} border: 1px solid #9FD9BD; color: #064F3B;`)}>
                Paddle Buyer Terms
              </A>
            </div>
          </div>
          <div style={s("display: flex; flex-direction: column; gap: 10px;")}>
            <h3 style={s("margin: 0; font-size: 18px; font-weight: 750;")}>Country-specific withdrawal rights</h3>
            <p style={s("margin: 0 0 4px; font-size: 14px; line-height: 1.55; color: #3A4A52;")}>
              {NOX.paddle.regionsNote} <span style={s("font-weight: 700;")}>As of {NOX.paddle.asOf}.</span>
            </p>
            <PaddleRegions regions={NOX.paddle.regions} />
          </div>
        </div>
      </section>

      <section aria-labelledby="full-h" style={s("max-width: 920px; margin: 0 auto; padding: 56px 24px 64px;")}>
        <KickerH2 id="full-h" margin="0 0 14px">
          Full policy text
        </KickerH2>
        <nav aria-label="Policy sections" style={s("display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;")} data-noprint="true">
          {chips.map((c) => (
            <JumpLink
              key={c.id}
              id={c.id}
              className="h-bd-ink"
              style={s("display: inline-flex; align-items: center; min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid #D9E8E0; font-size: 14px; font-weight: 600; text-decoration: none; color: #24343C;")}
            >
              {c.label}
            </JumpLink>
          ))}
        </nav>
        <PolicyBody sections={visibleSections(S)} />
      </section>

      <CrossLinksBand heading="Billing and support" links={related} />
    </LegalShell>
  );
}
