import { LegalShell } from "@/components/site/legal/legal-shell";
import { A, Breadcrumb, CrossLinksBand, HOME, TRUST } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { s } from "@/components/site/legal/s";
import { META_DOC, NOX, legalHref, legalMetadata, visibleSections } from "@/lib/marketing/legal/nox";
import { SecurityControls, type ControlFamily } from "./security-controls";

const ROUTE = "/trust/security";
export const metadata = legalMetadata(ROUTE);

const FAMILIES: [string, string, string[]][] = [
  ["GV", "Govern", ["Security governance", "Vendor risk"]],
  ["PR", "Protect", ["Tenant isolation", "Identity and access", "Encryption", "Secrets and integrations", "Secure development lifecycle"]],
  ["DE·RS", "Detect & respond", ["Audit logging", "Incident response", "Vulnerability management"]],
  ["RC", "Recover", ["Backups and recovery"]],
  ["AI", "AI security", ["AI security"]],
];

export default function SecurityPage() {
  const vis = visibleSections(NOX.security.sections);
  const families: ControlFamily[] = FAMILIES.map(([code, name, titles]) => ({
    code,
    name,
    items: titles.map((t) => vis.find((x) => x.title === t)).filter((x): x is NonNullable<typeof x> => !!x),
  }));
  const cust = NOX.security.sections.find((x) => x.title === "Customer responsibility")?.blocks[0]?.x ?? "";
  const customerList = cust
    .replace(/^Customers remain responsible for /, "")
    .split(". ")[0]
    .replace(/\.$/, "")
    .split(/,\s*(?:and\s+)?/)
    .map((x) => x[0].toUpperCase() + x.slice(1));
  const related = [
    { href: legalHref("privacy"), label: "Privacy Policy", desc: "Personal data handling and rights." },
    { href: legalHref("dpa", "annex-ii"), label: "Data Processing Addendum", desc: "Annex II technical and organizational measures." },
    { href: legalHref("subprocessors"), label: "Subprocessors", desc: "Providers that process customer data." },
    { href: legalHref("status"), label: "Service status", desc: "Live service health and incidents." },
    { href: legalHref("aup"), label: "Acceptable Use", desc: "Security abuse is prohibited." },
  ];
  const lbl = "font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;";

  return (
    <LegalShell route={ROUTE}>
      <section aria-labelledby="sec-h1" style={s("background: linear-gradient(180deg, #043F31 0%, #064F3B 100%); color: #FFFFFF;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 52px;")}>
          <Breadcrumb items={[HOME, TRUST, { label: "Security" }]} tone="dark" />
          <div style={s("margin-top: 30px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 28px 56px; align-items: end;")}>
            <div style={s("display: flex; flex-direction: column; gap: 14px;")}>
              <h1 id="sec-h1" style={s("margin: 0; font-size: clamp(38px, 5vw, 58px); line-height: 1.04; font-weight: 800; letter-spacing: -0.03em;")}>
                Security
              </h1>
              <p style={s("margin: 0; font-size: clamp(20px, 2.2vw, 26px); line-height: 1.35; font-weight: 700; color: #44F0B0; text-wrap: balance;")}>
                Security designed for a multi-tenant Business Operating System.
              </p>
            </div>
            <div style={s("padding: 20px; border-radius: 16px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.18); display: flex; flex-direction: column; gap: 8px;")}>
              <span style={s("font-size: 12px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #44F0B0;")}>Certifications and attestations</span>
              <p style={s("margin: 0; font-size: 15px; line-height: 1.6; color: #E6F4EE;")}>
                Noxtill shows a certification or attestation only after it has been independently obtained and applies. None are listed at this time. This page describes the controls of the Noxtill security program.
              </p>
            </div>
          </div>
          <div style={s("margin-top: 26px;")}>
            <PolicyMeta doc={META_DOC} policy="security" dark />
          </div>
        </div>
      </section>

      <section id="architecture" aria-labelledby="arch-h" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 12px; scroll-margin-top: 90px;")}>
        <h2 id="arch-h" style={s("margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;")}>
          Multi-tenant architecture
        </h2>
        <p style={s("margin: 0 0 22px; font-size: 15px; color: #3A4A52; max-width: 74ch;")}>
          Every request, background job, export, search, webhook and AI/tool call is scoped to an authenticated tenant, business and branch context.
        </p>
        <figure role="group" aria-labelledby="arch-cap" style={s("margin: 0; display: flex; flex-direction: column; gap: 10px;")}>
          <figcaption id="arch-cap" className="nl-sr">
            Layered diagram: users pass through identity and access controls into an isolated tenant boundary containing business, branch, role and field scopes, connected to the Integrations layer and secret storage, with audit logging and
            encrypted backups spanning all layers.
          </figcaption>
          <div style={s("display: flex; flex-wrap: wrap; gap: 10px;")}>
            <div style={s("flex: 1 1 200px; padding: 16px; border-radius: 14px; background: #F7FAF8; border: 1px solid #D9E8E0;")}>
              <span style={s(`${lbl} color: #4C5B63;`)}>Entry</span>
              <p style={s("margin: 6px 0 0; font-size: 15px; font-weight: 700;")}>Owners, staff, API clients, webhooks</p>
            </div>
            <div style={s("flex: 2 1 320px; padding: 16px; border-radius: 14px; background: #ECFBF4; border: 1px solid #BFE8D3;")}>
              <span style={s(`${lbl} color: #067A50;`)}>Identity &amp; access</span>
              <p style={s("margin: 6px 0 0; font-size: 15px; font-weight: 700;")}>RBAC · field-level restrictions · MFA capability · session controls · time-bound support access</p>
            </div>
          </div>
          <div style={s("padding: 18px; border-radius: 18px; background: #043F31; color: #FFFFFF; display: flex; flex-direction: column; gap: 12px;")}>
            <div style={s("display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;")}>
              <span style={s("font-size: 12px; font-weight: 800; color: #44F0B0; text-transform: uppercase; letter-spacing: 0.08em;")}>Tenant boundary — server-side authorization</span>
              <span style={s("font-size: 13px; color: #CFE8DD;")}>Browser-supplied tenant IDs are never treated as authorization</span>
            </div>
            <div style={s("display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px;")}>
              {[
                ["tenant", "Workspace / tenant"],
                ["business", "Business / entity"],
                ["branch", "Branch scope"],
                ["role · field", "Role and field-level access"],
              ].map(([k, v]) => (
                <div key={k} style={s("padding: 14px; border-radius: 12px; background: rgba(255,255,255,0.08); border: 1px solid rgba(68,240,176,0.3);")}>
                  <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #9FF5D3;")}>{k}</span>
                  <p style={s("margin: 4px 0 0; font-size: 14px; font-weight: 700;")}>{v}</p>
                </div>
              ))}
            </div>
            <p style={s("margin: 0; font-size: 13px; color: #CFE8DD;")}>
              40 modules share canonical records inside the boundary — CRM, Unified Inbox, Orders, Payments &amp; Billing, Finance, Inventory, Documents and more.
            </p>
          </div>
          <div style={s("display: flex; flex-wrap: wrap; gap: 10px;")}>
            <div style={s("flex: 1 1 260px; padding: 16px; border-radius: 14px; background: #ECFBF4; border: 1px solid #BFE8D3;")}>
              <span style={s(`${lbl} color: #067A50;`)}>Integrations layer</span>
              <p style={s("margin: 6px 0 0; font-size: 15px; font-weight: 700;")}>OAuth tokens, API keys and webhook secrets in secure secret storage — never in frontend code, logs, exports or AI prompts</p>
            </div>
            <div style={s("flex: 1 1 260px; padding: 16px; border-radius: 14px; background: #F7FAF8; border: 1px solid #D9E8E0;")}>
              <span style={s(`${lbl} color: #4C5B63;`)}>Spanning every layer</span>
              <p style={s("margin: 6px 0 0; font-size: 15px; font-weight: 700;")}>TLS in transit · audit logging · encrypted, restore-tested backups</p>
            </div>
          </div>
        </figure>
      </section>

      <SecurityControls families={families} />

      <section aria-label="Responsibilities and reporting" style={s("max-width: 1240px; margin: 0 auto; padding: 48px 24px 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 16px;")}>
        <div style={s("padding: 24px; border-radius: 18px; background: #ECFBF4; border: 1px solid #BFE8D3; display: flex; flex-direction: column; gap: 10px;")}>
          <h2 style={s("margin: 0; font-size: 21px; font-weight: 800;")}>Your responsibilities</h2>
          <ul style={s("margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 15px; line-height: 1.5;")}>
            {customerList.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <p style={s("margin: 4px 0 0; font-size: 14px; color: #24343C; font-weight: 600;")}>No security program eliminates all risk.</p>
        </div>
        <div id="report" style={s("padding: 24px; border-radius: 18px; background: #043F31; color: #FFFFFF; display: flex; flex-direction: column; gap: 10px; scroll-margin-top: 90px;")}>
          <h2 style={s("margin: 0; font-size: 21px; font-weight: 800;")}>Report a vulnerability or incident</h2>
          <p style={s("margin: 0; font-size: 15px; line-height: 1.6; color: #D7EFE5;")}>
            Report suspected vulnerabilities or security incidents to{" "}
            <a href="mailto:support@noxtill.com" style={s("color: #44F0B0; font-weight: 700;")}>
              support@noxtill.com
            </a>
            . A dedicated secure reporting route will be published here once available. Destructive security testing without authorization is prohibited under the Acceptable Use Policy.
          </p>
          <p style={s("margin: 0; font-size: 14px; color: #CFE8DD;")}>Never send passwords, API secrets or customer data in a report.</p>
          <A href="/status" style={s("align-self: flex-start; color: #FFFFFF; font-weight: 700;")}>
            Check service status →
          </A>
        </div>
      </section>

      <div style={s("margin-top: 48px;")}>
        <CrossLinksBand heading="Related trust resources" links={related} />
      </div>
    </LegalShell>
  );
}
