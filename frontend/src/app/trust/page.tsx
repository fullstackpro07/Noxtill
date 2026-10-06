import { LegalShell } from "@/components/site/legal/legal-shell";
import { A, Breadcrumb, HOME } from "@/components/site/legal/primitives";
import { TrustCenterSearch } from "@/components/site/legal/legal-search";
import { s } from "@/components/site/legal/s";
import { NOX, legalHref, legalMetadata, pad2, routeOf } from "@/lib/marketing/legal/nox";
import { StatusCard } from "./status-card";

const ROUTE = "/trust";
export const metadata = legalMetadata(ROUTE);

export default function TrustCenterPage() {
  const pillars: [string, string, string[]][] = [
    ["Privacy & Data", "How personal data and Customer Content are handled, and how to exercise your rights.", ["privacy", "dpa", "cookies", "messaging"]],
    ["Security", "Controls protecting a multi-tenant Business Operating System, and the providers behind it.", ["security", "subprocessors", "status"]],
    ["Responsible AI", "What AI does in Noxtill, its limits and where humans approve.", ["ai"]],
    ["Legal & Compliance", "The agreements, rules and company facts that govern Noxtill.", ["terms", "productTerms", "regional", "aup", "refunds", "accessibility", "company", "legal"]],
  ];
  const tile = "display: flex; flex-direction: column; gap: 8px; padding: 20px; border-radius: 16px; text-decoration: none;";
  const k = "font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;";

  const hero = (
    <>
      <Breadcrumb items={[HOME, { label: "Trust Center" }]} tone="dark" />
      <div style={s("margin-top: 34px; display: flex; flex-direction: column; gap: 14px; max-width: 800px;")}>
        <h1 id="tc-h1" style={s("margin: 0; font-size: clamp(38px, 5vw, 60px); line-height: 1.04; font-weight: 800; letter-spacing: -0.03em;")}>
          Noxtill Trust Center
        </h1>
        <p style={s("margin: 0; font-size: clamp(20px, 2.4vw, 28px); font-weight: 700; color: #44F0B0;")}>Trust is part of the product.</p>
      </div>
    </>
  );

  return (
    <LegalShell route={ROUTE} pageType="CollectionPage">
      <TrustCenterSearch hero={hero} />

      <section aria-label="Trust pillars" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px; display: flex; flex-direction: column; gap: 36px;")}>
        {pillars.map(([name, text, keys]) => (
          <div key={name} style={s("display: flex; flex-wrap: wrap; gap: 16px 32px;")}>
            <div style={s("flex: 1 1 220px; max-width: 300px; display: flex; flex-direction: column; gap: 6px;")}>
              <h2 style={s("margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em;")}>{name}</h2>
              <p style={s("margin: 0; font-size: 15px; line-height: 1.55; color: #3A4A52;")}>{text}</p>
            </div>
            <div style={s("flex: 3 1 560px; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px;")}>
              {keys.map(routeOf).map((c) => (
                <A
                  key={c.key}
                  href={c.route}
                  className="h-card"
                  style={s("display: flex; flex-direction: column; gap: 6px; padding: 18px; border-radius: 16px; border: 1px solid #D9E8E0; text-decoration: none; color: #0B1822; min-height: 120px;")}
                >
                  <span style={s("font-size: 17px; font-weight: 800; color: #064F3B;")}>{c.name} →</span>
                  <span style={s("font-size: 14px; line-height: 1.5; color: #3A4A52;")}>{c.description}</span>
                  <span style={s("margin-top: auto; font-size: 12px; color: #4C5B63;")}>Updated {c.updated}</span>
                </A>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section aria-labelledby="gs-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 12px;")}>
        <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 24px 48px; padding: 28px; border-radius: 22px; background: #043F31; color: #FFFFFF;")}>
          <div style={s("display: flex; flex-direction: column; gap: 12px;")}>
            <h2 id="gs-h" style={s("margin: 0; font-size: clamp(24px, 3vw, 32px); font-weight: 800; letter-spacing: 0.01em; color: #44F0B0;")}>
              GLOBAL STANDARDS. LOCAL RIGHTS.
            </h2>
            <p style={s("margin: 0; font-size: 16px; line-height: 1.65; color: #E6F4EE;")}>{NOX.legal.globalStatement}</p>
            <p style={s("margin: 0; font-size: 14px; color: #CFE8DD;")}>Noxtill LLC · Phoenix, Arizona, United States</p>
            <A
              href={legalHref("regional")}
              style={s("align-self: flex-start; display: inline-flex; align-items: center; height: 44px; padding: 0 18px; border-radius: 11px; background: #44F0B0; color: #043F31; font-weight: 800; font-size: 15px; text-decoration: none;")}
            >
              View regional addenda
            </A>
          </div>
          <ul aria-label="Regions with published supplementary terms" style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0;")}>
            {NOX.regional.map((r) => (
              <li key={r.key}>
                <A
                  href={`${legalHref("regional")}#region-${r.key}`}
                  className="h-neon"
                  style={s("display: flex; justify-content: space-between; gap: 12px; padding: 12px 4px; border-bottom: 1px solid rgba(255,255,255,0.14); color: #FFFFFF; text-decoration: none; font-size: 16px; font-weight: 700;")}
                >
                  <span>{r.name}</span>
                  <span style={s("font-size: 13px; font-weight: 600; color: #CFE8DD;")}>{r.group} →</span>
                </A>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-label="Live trust modules" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 270px), 1fr)); gap: 14px;")}>
        <StatusCard />
        <div style={s("display: flex; flex-direction: column; gap: 8px; padding: 20px; border-radius: 16px; background: #F7FAF8; border: 1px solid #E3EEE8;")}>
          <span style={s(`${k} color: #4C5B63;`)}>Latest policy updates</span>
          {NOX.history.map((u) => (
            <span key={u.version} style={s("font-size: 15px; line-height: 1.5;")}>
              <strong>v{u.version}</strong> · {u.date} — {u.summary}
            </span>
          ))}
        </div>
        <A href={legalHref("dpa")} style={s(`${tile} background: #043F31; color: #FFFFFF;`)}>
          <span style={s(`${k} color: #44F0B0;`)}>Procurement</span>
          <span style={s("font-size: 17px; font-weight: 800;")}>Download the DPA</span>
          <span style={s("font-size: 14px; color: #D7EFE5;")}>Main DPA and Annexes I–III →</span>
        </A>
        <A href={`${legalHref("subprocessors")}#subscribe`} style={s(`${tile} background: #ECFBF4; color: #0B1822;`)}>
          <span style={s(`${k} color: #067A50;`)}>Subprocessors</span>
          <span style={s("font-size: 17px; font-weight: 800;")}>Subscribe to changes</span>
          <span style={s("font-size: 14px; color: #3A4A52;")}>Notice of material new subprocessors →</span>
        </A>
        <A href={legalHref("contact", "privacy")} style={s(`${tile} background: #ECFBF4; color: #0B1822;`)}>
          <span style={s(`${k} color: #067A50;`)}>Privacy</span>
          <span style={s("font-size: 17px; font-weight: 800;")}>Make a privacy request</span>
          <span style={s("font-size: 14px; color: #3A4A52;")}>Routed to privacy@noxtill.com →</span>
        </A>
      </section>

      <section aria-labelledby="pr-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 64px;")}>
        <h2 id="pr-h" style={s("margin: 0 0 18px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
          Trust principles
        </h2>
        <ol style={s("list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 0; border-top: 1px solid #D9E8E0;")}>
          {NOX.trustPrinciples.map((p, i) => (
            <li key={p.k} style={s("display: flex; gap: 16px; padding: 20px 4px; border-bottom: 1px solid #E3EEE8;")}>
              <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #067A50; padding-top: 3px;")}>{pad2(i + 1)}</span>
              <div>
                <h3 style={s("margin: 0 0 4px; font-size: 17px; font-weight: 800;")}>{p.k}</h3>
                <p style={s("margin: 0; font-size: 15px; line-height: 1.55; color: #24343C;")}>{p.v}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </LegalShell>
  );
}
