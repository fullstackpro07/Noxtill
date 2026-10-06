import { LegalShell } from "@/components/site/legal/legal-shell";
import { Breadcrumb, CrossLinks, HOME, LEGAL } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { s } from "@/components/site/legal/s";
import { META_DOC, NOX, legalHref, legalMetadata, pad2 } from "@/lib/marketing/legal/nox";
import { RegionTabs } from "./region-tabs";

const ROUTE = "/legal/regional-addenda";
export const metadata = legalMetadata(ROUTE);

export default function RegionalAddendaPage() {
  const layers: [string, string][] = [
    ["Global base terms", "↓"],
    ["Product-specific terms", "↓"],
    ["Regional addendum", "↓"],
    ["Mandatory local rights", ""],
  ];
  const related = [
    { href: legalHref("terms"), label: "Terms of Service", desc: "The global platform agreement." },
    { href: legalHref("productTerms"), label: "Product-Specific Terms", desc: "Terms for the modules you enable." },
    { href: legalHref("privacy"), label: "Privacy Policy", desc: "Global privacy baseline." },
    { href: legalHref("refunds"), label: "Refund & Cancellation", desc: "Voluntary refunds and mandatory rights." },
    { href: legalHref("dpa"), label: "Data Processing Addendum", desc: "Transfers and processor terms." },
  ];
  return (
    <LegalShell route={ROUTE}>
      <section aria-labelledby="ra-h1" style={s("background: #043F31; color: #FFFFFF;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 48px;")}>
          <Breadcrumb items={[HOME, LEGAL, { label: "Regional Addenda" }]} tone="dark" noprint />
          <div style={s("margin-top: 30px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 28px 56px; align-items: end;")}>
            <div style={s("display: flex; flex-direction: column; gap: 14px;")}>
              <h1 id="ra-h1" style={s("margin: 0; font-size: clamp(34px, 4.6vw, 54px); line-height: 1.06; font-weight: 800; letter-spacing: -0.03em;")}>
                Regional Addenda
              </h1>
              <p style={s("margin: 0; font-size: clamp(20px, 2.4vw, 28px); font-weight: 800; letter-spacing: 0.02em; color: #44F0B0;")}>GLOBAL STANDARDS. LOCAL RIGHTS.</p>
              <p style={s("margin: 0; font-size: 17px; line-height: 1.6; color: #E6F4EE; max-width: 60ch;")}>{NOX.legal.globalStatement}</p>
            </div>
            <ol aria-label="How the layers combine" style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px;")}>
              {layers.map(([name, arrow], i) => (
                <li
                  key={name}
                  style={s(`display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 12px; background: ${i === 3 ? "rgba(68,240,176,0.16)" : "rgba(255,255,255,0.06)"}; border: 1px solid rgba(68,240,176,0.3);`)}
                >
                  <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #44F0B0;")}>{pad2(i + 1)}</span>
                  <strong style={s("font-size: 15px; letter-spacing: 0.04em;")}>{name.toUpperCase()}</strong>
                  <span aria-hidden="true" style={s("margin-left: auto; color: #44F0B0;")}>
                    {arrow}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div style={s("margin-top: 24px;")}>
            <PolicyMeta doc={META_DOC} policy="regional" dark />
          </div>
        </div>
      </section>

      <RegionTabs regions={NOX.regional} />

      <section aria-labelledby="fm-h" style={s("max-width: 1240px; margin: 0 auto; padding: 40px 24px 12px;")}>
        <div style={s("padding: 24px; border-radius: 18px; background: #F7FAF8; border: 1px solid #E3EEE8; display: flex; flex-wrap: wrap; gap: 14px 32px;")}>
          <div style={s("flex: 1 1 320px;")}>
            <h2 id="fm-h" style={s("margin: 0 0 6px; font-size: 20px; font-weight: 800;")}>
              Markets without a published addendum
            </h2>
            <p style={s("margin: 0; font-size: 15px; line-height: 1.6; color: #24343C;")}>{NOX.regionalPendingNote}</p>
          </div>
          <ul style={s("flex: 2 1 420px; list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; align-content: flex-start;")}>
            {NOX.regionalPending.map((m) => (
              <li key={m} style={s("padding: 8px 12px; border-radius: 10px; background: #FFFFFF; border: 1px solid #D9E8E0; font-size: 14px; font-weight: 600;")}>
                {m}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section style={s("max-width: 1240px; margin: 0 auto; padding: 40px 24px 64px;")}>
        <CrossLinks heading="Global policies these addenda supplement" links={related} />
      </section>
    </LegalShell>
  );
}
