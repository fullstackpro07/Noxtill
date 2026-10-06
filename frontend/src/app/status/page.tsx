import { LegalShell } from "@/components/site/legal/legal-shell";
import { A, Breadcrumb, CrossLinks, HOME } from "@/components/site/legal/primitives";
import { s } from "@/components/site/legal/s";
import { NOX, legalHref, legalMetadata } from "@/lib/marketing/legal/nox";
import { StatusView } from "./status-view";

const ROUTE = "/status";
export const metadata = legalMetadata(ROUTE);

export default function StatusPage() {
  const related = [
    { href: legalHref("contact", "support"), label: "Support", desc: "Get help with your account or an issue." },
    { href: legalHref("security"), label: "Security", desc: "Incident response and reporting." },
    { href: legalHref("trust"), label: "Trust Center", desc: "All trust and legal resources." },
  ];
  return (
    <LegalShell route={ROUTE}>
      <section aria-labelledby="st-h1" style={s("max-width: 1040px; margin: 0 auto; padding: 28px 24px 12px;")}>
        <Breadcrumb items={[HOME, { label: "Status" }]} />
        <h1 id="st-h1" style={s("margin: 24px 0 18px; font-size: clamp(32px, 4vw, 46px); line-height: 1.08; font-weight: 800; letter-spacing: -0.025em;")}>
          Noxtill Status
        </h1>
        <StatusView names={NOX.statusRules.components} stages={NOX.statusRules.stages} />
      </section>

      <section aria-labelledby="sub-h" style={s("max-width: 1040px; margin: 0 auto; padding: 32px 24px 12px;")}>
        <div style={s("padding: 22px; border-radius: 16px; background: #043F31; color: #FFFFFF; display: flex; flex-wrap: wrap; gap: 12px 28px; align-items: center; justify-content: space-between;")}>
          <div style={s("flex: 1 1 380px;")}>
            <h2 id="sub-h" style={s("margin: 0 0 4px; font-size: 18px; font-weight: 800;")}>
              Status notifications
            </h2>
            <p style={s("margin: 0; font-size: 15px; line-height: 1.55; color: #D7EFE5;")}>Email, webhook and RSS status subscriptions are not available yet. Contact support if you need help now.</p>
          </div>
          <A
            href="/contact#support"
            style={s("display: inline-flex; align-items: center; height: 46px; padding: 0 18px; border-radius: 11px; background: #44F0B0; color: #043F31; font-weight: 800; font-size: 15px; text-decoration: none;")}
          >
            Contact support
          </A>
        </div>
      </section>
      <section style={s("max-width: 1040px; margin: 0 auto; padding: 32px 24px 64px;")}>
        <CrossLinks heading="Related" links={related} />
      </section>
    </LegalShell>
  );
}
