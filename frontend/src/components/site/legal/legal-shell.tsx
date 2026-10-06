import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { NOX, legalJsonLd } from "@/lib/marketing/legal/nox";
import { legalFontVars } from "./fonts";
import { s } from "./s";
import "./legal.css";

/**
 * Page frame shared by every Legal & Trust page: skip link, site header, <main id="main">,
 * the print-only document header, JSON-LD, and the site footer.
 */
export function LegalShell({
  route,
  pageType,
  printTitle,
  children,
  after,
}: {
  route: string;
  pageType?: string;
  /** When set, a print-only header line identifies the document on paper/PDF. */
  printTitle?: string;
  children: ReactNode;
  /** Rendered after </main> (fixed mobile contents button + drawer). */
  after?: ReactNode;
}) {
  const d = NOX.doc;
  return (
    <div className={`nl ${legalFontVars}`} data-theme="light">
      <a href="#main" className="nl-skip">
        Skip to content
      </a>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: legalJsonLd(route, pageType) }} />
      <SiteHeader />
      <main id="main" tabIndex={-1} style={s("outline: none;")}>
        {printTitle ? (
          <div data-printonly="true" style={s("padding: 0 0 10px; border-bottom: 2px solid #064F3B; margin-bottom: 14px; font-size: 11pt;")}>
            <strong>Noxtill LLC</strong> · {printTitle} · https://noxtill.com{route} · Version {d.version} · Last updated {d.lastUpdated} · Effective date{" "}
            {d.effective ?? "set on publication"}
          </div>
        ) : null}
        {children}
      </main>
      {after}
      <SiteFooter />
    </div>
  );
}
