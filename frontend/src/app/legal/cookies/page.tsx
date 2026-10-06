import { LegalShell } from "@/components/site/legal/legal-shell";
import { Breadcrumb, CrossLinksBand, HOME, LEGAL, KickerH2 } from "@/components/site/legal/primitives";
import { PolicyMeta } from "@/components/site/legal/policy-meta";
import { PolicyBody } from "@/components/site/legal/policy-body";
import { s } from "@/components/site/legal/s";
import { META_DOC, NOX, legalHref, legalMetadata, visibleSections } from "@/lib/marketing/legal/nox";
import { CookieChoices, CookieInventory, ManageCookiesButton } from "./cookies-view";

const ROUTE = "/legal/cookies";
export const metadata = legalMetadata(ROUTE);

export default function CookiesPage() {
  const S = NOX.cookies.sections;
  const items = S.find((x) => x.title === "Categories")?.blocks.find((b) => b.isUl)?.items ?? [];
  const txt = (p: string) => {
    const i = items.find((x) => x.startsWith(p));
    return i ? i.slice(i.indexOf(":") + 1).trim() : "";
  };
  const sec = (t: string) =>
    (S.find((x) => x.title.startsWith(t))?.blocks ?? [])
      .filter((b) => b.tier === "public")
      .map((b) => b.x)
      .join(" ");
  const regions = [
    { key: "eea", label: "EEA / UK", title: "EEA/UK-style consent", text: sec("EEA/UK") },
    { key: "us", label: "United States", title: "U.S. state privacy choices", text: sec("U.S. state") },
    {
      key: "other",
      label: "Other regions",
      title: "Other regions",
      text: `Noxtill uses a global baseline plus region/country addenda when a market is active or legal thresholds apply, and mandatory rights always prevail. ${sec("EEA/UK").split(". ")[0]}.`,
    },
  ];
  const related = [
    { href: legalHref("privacy", "p-9-cookies-and-similar-technologies"), label: "Privacy Policy", desc: "How Noxtill handles personal data." },
    { href: legalHref("subprocessors"), label: "Subprocessors", desc: "Service providers that process customer data." },
    { href: legalHref("contact", "privacy"), label: "Privacy choices", desc: "Opt-out and privacy requests." },
    { href: legalHref("security"), label: "Security", desc: "How Noxtill protects data." },
    { href: legalHref("trust"), label: "Trust Center", desc: "All trust and legal resources." },
  ];

  return (
    <LegalShell route={ROUTE}>
      <section aria-labelledby="ck-h1" style={s("background: linear-gradient(180deg, #F2FBF7 0%, #FFFFFF 100%); border-bottom: 1px solid #E3EEE8;")}>
        <div style={s("max-width: 1240px; margin: 0 auto; padding: 28px 24px 44px;")}>
          <Breadcrumb items={[HOME, LEGAL, { label: "Cookie Policy" }]} />
          <div style={s("display: flex; flex-wrap: wrap; gap: 24px 48px; align-items: flex-end; justify-content: space-between; margin-top: 26px;")}>
            <div style={s("flex: 1 1 520px; display: flex; flex-direction: column; gap: 14px;")}>
              <h1 id="ck-h1" style={s("margin: 0; font-size: clamp(36px, 4.6vw, 54px); line-height: 1.06; font-weight: 800; letter-spacing: -0.03em;")}>
                Cookie Policy
              </h1>
              <p style={s("margin: 0; font-size: clamp(20px, 2.2vw, 26px); font-weight: 700; color: #064F3B;")}>Your browser. Your choice.</p>
              <p style={s("margin: 0; font-size: 17px; line-height: 1.6; color: #2A3A42; max-width: 62ch;")}>{NOX.cookies.intro}</p>
            </div>
            <ManageCookiesButton />
          </div>
          <div style={s("margin-top: 26px;")}>
            <PolicyMeta doc={META_DOC} policy="cookies" />
          </div>
        </div>
      </section>

      <CookieChoices
        texts={{ necessary: txt("Strictly necessary"), functional: txt("Functional"), analytics: txt("Analytics"), advertising: txt("Advertising/targeting") }}
        regions={regions}
        policyVersion={NOX.doc.version}
      />
      <CookieInventory inventory={NOX.cookieInventory ?? []} />

      <section aria-labelledby="ck-full" style={s("max-width: 920px; margin: 0 auto; padding: 56px 24px 64px;")}>
        <KickerH2 id="ck-full">Full policy text</KickerH2>
        <p style={s("margin: 0 0 8px; font-size: 17px; line-height: 1.7;")}>{NOX.cookies.intro}</p>
        <PolicyBody sections={visibleSections(S)} compact />
      </section>
      <CrossLinksBand heading="Related privacy resources" links={related} />
    </LegalShell>
  );
}
