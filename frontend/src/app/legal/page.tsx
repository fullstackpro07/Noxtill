import { LegalShell } from "@/components/site/legal/legal-shell";
import { A, Breadcrumb, HOME } from "@/components/site/legal/primitives";
import { LegalCenterSearch } from "@/components/site/legal/legal-search";
import { s } from "@/components/site/legal/s";
import { NOX, legalHref, legalMetadata, routeOf } from "@/lib/marketing/legal/nox";
import { ModuleMap } from "./module-map";

const ROUTE = "/legal";
export const metadata = legalMetadata(ROUTE);

const POLICY_KEY: Record<string, string> = {
  Privacy: "privacy",
  "Privacy Policy": "privacy",
  AI: "ai",
  "AI Transparency": "ai",
  Security: "security",
  Terms: "terms",
  Refunds: "refunds",
  "Refund & Cancellation": "refunds",
  Messaging: "messaging",
  "Messaging & Consent": "messaging",
  DPA: "dpa",
  AUP: "aup",
  Cookies: "cookies",
  Subprocessors: "subprocessors",
};
const LABEL: Record<string, string> = {
  privacy: "Privacy Policy",
  ai: "AI Transparency",
  security: "Security",
  terms: "Terms of Service",
  refunds: "Refund & Cancellation",
  messaging: "Messaging & Consent",
  dpa: "DPA",
  aup: "Acceptable Use",
  cookies: "Cookie Policy",
  subprocessors: "Subprocessors",
};

export default function LegalCenterPage() {
  const groups: [string, string[]][] = [
    ["Agreements", ["terms", "productTerms", "dpa", "refunds", "regional"]],
    ["Privacy", ["privacy", "cookies", "dns", "messaging"]],
    ["Platform rules", ["aup", "ai"]],
    ["Trust", ["trust", "security", "subprocessors", "status"]],
    ["Company", ["company", "about", "contact", "accessibility"]],
  ];
  const precedenceHrefs = [legalHref("contact", "sales"), legalHref("dpa"), legalHref("regional"), legalHref("productTerms"), legalHref("terms"), legalHref("aup")];
  const modules = NOX.modules.map((m) => ({
    id: m.id,
    n: m.n,
    name: m.name,
    scope: m.scope,
    position: m.position,
    treatment: m.treatment,
    keys: Array.from(new Set((m.primary || "").split(/,\s*/).map((x) => POLICY_KEY[x.trim()]).filter(Boolean))),
  }));
  const routes = Object.fromEntries(Object.keys(LABEL).map((k) => [k, legalHref(k)]));

  return (
    <LegalShell route={ROUTE} pageType="CollectionPage">
      <section aria-labelledby="lc-h1" style={s("background: #F7FAF8; border-bottom: 1px solid #E3EEE8;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 40px;")}>
          <Breadcrumb items={[HOME, { label: "Legal" }]} />
          <div style={s("margin-top: 24px; display: flex; flex-direction: column; gap: 12px; max-width: 820px;")}>
            <h1 id="lc-h1" style={s("margin: 0; font-size: clamp(36px, 4.6vw, 54px); line-height: 1.06; font-weight: 800; letter-spacing: -0.03em;")}>
              Legal Center
            </h1>
            <p style={s("margin: 0; font-size: 17px; line-height: 1.6; color: #2A3A42;")}>{NOX.legal.agreementStatement}</p>
          </div>
          <LegalCenterSearch />
        </div>
      </section>

      <section aria-labelledby="arch-h" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px;")}>
        <h2 id="arch-h" style={s("margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
          How the Noxtill agreement fits together
        </h2>
        <p style={s("margin: 0 0 18px; font-size: 15px; color: #3A4A52;")}>Order of precedence, from the most specific document to the most general. {NOX.legal.precedenceNote}</p>
        <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 20px;")}>
          <ol style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px;")}>
            {NOX.legal.precedence.map(([name, desc], i) => (
              <li key={name}>
                <A
                  href={precedenceHrefs[i] ?? "/legal"}
                  className="h-bd"
                  style={s("display: flex; gap: 14px; align-items: baseline; padding: 12px 14px; border-radius: 12px; border: 1px solid #D9E8E0; text-decoration: none; color: #0B1822;")}
                >
                  <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #067A50;")}>{i + 1}</span>
                  <span>
                    <strong style={s("font-size: 15px; color: #064F3B;")}>{name}</strong>
                    <span style={s("display: block; font-size: 13px; color: #3A4A52;")}>{desc}</span>
                  </span>
                </A>
              </li>
            ))}
          </ol>
          <div style={s("padding: 20px; border-radius: 16px; background: #F7FAF8; border: 1px solid #E3EEE8;")}>
            <h3 style={s("margin: 0 0 12px; font-size: 16px; font-weight: 800;")}>Where each rule lives</h3>
            <dl style={s("margin: 0; display: grid; grid-template-columns: 1fr; gap: 0;")}>
              {NOX.legal.owners.map(([topic, k]) => (
                <div key={topic} style={s("display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; padding: 9px 0; border-bottom: 1px solid #E3EEE8;")}>
                  <dt style={s("font-size: 14px;")}>{topic}</dt>
                  <dd style={s("margin: 0;")}>
                    <A href={legalHref(k)} style={s("font-size: 14px; font-weight: 700;")}>
                      {routeOf(k).name}
                    </A>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section aria-labelledby="dir-h" style={s("max-width: 1240px; margin: 0 auto; padding: 44px 24px 12px;")}>
        <h2 id="dir-h" style={s("margin: 0 0 18px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
          Policy directory
        </h2>
        <div style={s("display: flex; flex-direction: column; gap: 28px;")}>
          {groups.map(([name, keys]) => (
            <div key={name}>
              <h3 style={s("margin: 0 0 10px; font-size: 13px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #067A50;")}>{name}</h3>
              <ul style={s("list-style: none; margin: 0; padding: 0; border-top: 1px solid #D9E8E0;")}>
                {keys.map(routeOf).map((p) => (
                  <li key={p.key} style={s("display: flex; flex-wrap: wrap; gap: 6px 24px; align-items: baseline; padding: 16px 4px; border-bottom: 1px solid #E3EEE8;")}>
                    <A href={p.route} className="h-ul" style={s("flex: 0 1 280px; font-size: 18px; font-weight: 750; color: #064F3B; text-decoration: none;")}>
                      {p.name}
                    </A>
                    <span style={s("flex: 1 1 380px; font-size: 15px; line-height: 1.55; color: #24343C;")}>{p.description}</span>
                    <span style={s("flex: 0 0 auto; font-size: 13px; color: #4C5B63; font-family: 'JetBrains Mono', monospace;")}>
                      {p.route} · v{NOX.doc.version} · {p.updated}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <ModuleMap modules={modules} labels={LABEL} routes={routes} />

      <section aria-labelledby="reg-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 64px;")}>
        <h2 id="reg-h" style={s("margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
          Country and regional framework
        </h2>
        <p style={s("margin: 0 0 16px; font-size: 15px; color: #3A4A52; max-width: 74ch;")}>
          {NOX.regionModel.intro} {NOX.regionModel.outro}
        </p>
        <div style={s("overflow-x: auto; border: 1px solid #D9E8E0; border-radius: 16px;")}>
          <table style={s("width: 100%; border-collapse: collapse; font-size: 14px; min-width: 760px;")}>
            <caption style={s("text-align: left; padding: 12px 18px; font-size: 13px; color: #4C5B63; border-bottom: 1px solid #D9E8E0;")}>
              Legal themes by region and where Noxtill addresses them. Mandatory rights always prevail.
            </caption>
            <thead>
              <tr style={s("background: #064F3B; color: #FFFFFF;")}>
                {["Region", "Legal themes", "Noxtill implementation"].map((h) => (
                  <th key={h} scope="col" style={s("text-align: left; padding: 12px 16px;")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOX.regionModel.table.rows.map(([a, b, c]) => (
                <tr key={a} style={s("border-top: 1px solid #E3EEE8;")}>
                  <th scope="row" style={s("text-align: left; padding: 12px 16px; vertical-align: top;")}>
                    {a}
                  </th>
                  <td style={s("padding: 12px 16px; line-height: 1.5;")}>{b}</td>
                  <td style={s("padding: 12px 16px; line-height: 1.5;")}>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </LegalShell>
  );
}
