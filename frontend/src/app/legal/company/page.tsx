import { LegalShell } from "@/components/site/legal/legal-shell";
import { A, Breadcrumb, HOME, LEGAL } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { s } from "@/components/site/legal/s";
import { META_DOC, NOX, legalMetadata } from "@/lib/marketing/legal/nox";
import { FactsTable } from "./facts-table";

const ROUTE = "/legal/company";
export const metadata = legalMetadata(ROUTE);

export default function CompanyPage() {
  const routes = NOX.contactRouting.rows
    .map(([need, contact, action]) => ({ need, contact, action }))
    .concat([{ need: "Legal notices", contact: "legal@noxtill.com", action: "Noxtill LLC, 4539 N 22ND ST STE R, Phoenix, AZ 85016, United States" }]);
  const trademark = NOX.trademark.find((b) => b.tier === "public")?.x ?? "";
  const h2 = s("margin: 0 0 14px; font-size: 22px; font-weight: 800;");
  return (
    <LegalShell route={ROUTE}>
      <section aria-labelledby="co-h1" style={s("background: #064F3B; color: #FFFFFF;")}>
        <div style={s("max-width: 1040px; margin: 0 auto; padding: 28px 24px 40px;")}>
          <Breadcrumb items={[HOME, LEGAL, { label: "Legal & Company Information" }]} tone="dark" />
          <div style={s("margin-top: 26px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap;")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/legal/noxtill-logo.png" alt="" width={56} height={56} style={s("width: 56px; height: 56px; border-radius: 14px;")} />
            <div>
              <h1 id="co-h1" style={s("margin: 0; font-size: clamp(32px, 4vw, 46px); line-height: 1.08; font-weight: 800; letter-spacing: -0.025em;")}>
                Legal &amp; Company Information
              </h1>
              <p style={s("margin: 6px 0 0; font-size: 18px; font-weight: 600; color: #44F0B0;")}>Noxtill LLC — Arizona, United States</p>
            </div>
          </div>
          <div style={s("margin-top: 22px;")}>
            <PolicyMeta doc={META_DOC} policy="company" dark />
          </div>
        </div>
      </section>

      <section aria-labelledby="facts-h" style={s("max-width: 1040px; margin: 0 auto; padding: 40px 24px 12px;")}>
        <h2 id="facts-h" style={h2}>
          Public company facts
        </h2>
        <FactsTable rows={NOX.companyFacts.rows} />
      </section>

      <section aria-labelledby="routes-h" style={s("max-width: 1040px; margin: 0 auto; padding: 28px 24px 12px;")}>
        <h2 id="routes-h" style={h2}>
          Legal contact routes
        </h2>
        <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 0; border-top: 1px solid #D9E8E0;")}>
          {routes.map((r) => (
            <div key={r.need} style={s("padding: 14px 8px; border-bottom: 1px solid #E3EEE8;")}>
              <div style={s("font-size: 13px; font-weight: 700; color: #4C5B63;")}>{r.need}</div>
              <div style={s("font-size: 16px; font-weight: 700; margin-top: 2px;")}>{r.contact}</div>
              <div style={s("font-size: 14px; color: #3A4A52; margin-top: 2px;")}>{r.action}</div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="tm-h" style={s("max-width: 1040px; margin: 0 auto; padding: 28px 24px 12px;")}>
        <h2 id="tm-h" style={s("margin: 0 0 10px; font-size: 22px; font-weight: 800;")}>
          Trademarks and copyright
        </h2>
        <p style={s("margin: 0; font-size: 16px; line-height: 1.7; max-width: 76ch;")}>{trademark}</p>
        <p style={s("margin: 10px 0 0; font-size: 15px; color: #3A4A52;")}>© 2026 Noxtill LLC. All rights reserved.</p>
      </section>

      <section aria-labelledby="idx-h" style={s("max-width: 1040px; margin: 0 auto; padding: 28px 24px 64px;")}>
        <h2 id="idx-h" style={h2}>
          Policy index
        </h2>
        <ul style={s("list-style: none; margin: 0; padding: 0; columns: 2 260px; column-gap: 32px;")}>
          {NOX.routes.map((p) => (
            <li key={p.key} style={s("break-inside: avoid; padding: 8px 0; border-bottom: 1px solid #EEF4F1; display: flex; justify-content: space-between; gap: 12px;")}>
              <A href={p.route} style={s("font-weight: 600;")}>
                {p.name}
              </A>
              <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #4C5B63;")}>{p.route}</span>
            </li>
          ))}
        </ul>
      </section>
    </LegalShell>
  );
}
