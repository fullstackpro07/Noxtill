import type { Metadata } from "next";
import raw from "./data/nox-content.json";

/**
 * Noxtill Legal & Trust content layer — the public text of the master legal document
 * (docs/Legal pages/content/noxtill-content.js, converted to JSON with design-file links
 * rewritten to real routes). Imported only from server components; client views receive the
 * slices they need as props so this file never ships to the browser.
 */

export type NoxTier = "public" | "pending" | "internal" | "config";

export interface NoxBlock {
  t: string;
  x?: string;
  items?: string[];
  tier: NoxTier;
  isP?: boolean;
  isUl?: boolean;
  isQuote?: boolean;
}

export interface NoxSection {
  num: string;
  title: string;
  id: string;
  blocks: NoxBlock[];
  movedTo?: { key: string; title: string; n: number };
}

export interface NoxTable {
  head: string[];
  rows: string[][];
}

export interface NoxRoute {
  key: string;
  route: string;
  name: string;
  cat: string;
  description: string;
  title: string;
  updated: string;
}

export interface NoxModule {
  n: number;
  id: string;
  name: string;
  scope: string;
  position: string;
  primary: string;
  treatment: string;
}

export interface NoxModuleMapRow {
  id: string;
  n: number;
  name: string;
  schedule: string;
  scheduleNum: number;
  policies: string;
  regional: string;
}

export interface NoxSchedule {
  key: string;
  n: number;
  title: string;
  short: string;
  purpose: string;
  modules: { n: number; name: string; id: string }[];
  also: string[];
  policies: { key: string; name: string }[];
  clauses: NoxSection[];
}

export interface NoxRegion {
  key: string;
  name: string;
  group: string;
  status: string;
  items: { topic: string; text: string; ref: string; href: string }[];
}

export interface NoxSeo {
  route: string;
  title: string;
  description: string;
  h1: string;
  canonical: string;
  breadcrumb: string[];
}

interface Nox {
  company: Record<string, string>;
  doc: { version: string; lastUpdated: string; lastUpdatedISO: string; effective: string | null };
  terms: { sections: NoxSection[] };
  privacy: { sections: NoxSection[] };
  refunds: { sections: NoxSection[]; usage: NoxTable };
  cookies: { intro: string; sections: NoxSection[] };
  aup: { sections: NoxSection[] };
  messaging: { sections: NoxSection[] };
  ai: { sections: NoxSection[]; tiers: NoxTable };
  security: { sections: NoxSection[] };
  dpa: { sections: NoxSection[]; annex1: NoxTable; annex2: string[]; annex3: string };
  subprocessors: { sections: NoxSection[]; roles: NoxTable; fields: string[] };
  accessibility: { sections: NoxSection[] };
  about: { copy: string[]; facts: string[]; hero: string };
  contactRouting: NoxTable;
  companyFacts: NoxTable;
  trademark: NoxBlock[];
  statusRules: { stages: string[]; rules: string[]; components: string[] };
  trustPrinciples: { k: string; v: string }[];
  regionModel: { intro: string; outro: string; table: NoxTable };
  consentSchema: { table: NoxTable; rule: string };
  modules: NoxModule[];
  aiRegister: { table: NoxTable };
  paddle: { asOf: string; regions: { key: string; region: string; period: string }[]; regionsNote: string };
  seo: Record<string, NoxSeo>;
  routes: NoxRoute[];
  history: { version: string; date: string; summary: string; current: boolean }[];
  subprocessorRegister: SubprocessorRow[];
  subprocessorChanges: { date: string; text: string }[];
  cookieInventory: CookieRow[];
  statusIncidents: StatusIncident[];
  productSchedules: NoxSchedule[];
  moduleMap: NoxModuleMapRow[];
  legal: {
    agreementStatement: string;
    precedence: [string, string][];
    precedenceNote: string;
    globalStatement: string;
    owners: [string, string][];
    policyRoutes: Record<string, string>;
  };
  regional: NoxRegion[];
  regionalPending: string[];
  regionalPendingNote: string;
}

export interface SubprocessorRow {
  category: string;
  provider: string;
  service: string;
  purpose: string;
  data: string;
  region: string;
  role: string;
  link: string;
  effective: string;
}

export interface CookieRow {
  name: string;
  provider: string;
  category: string;
  categoryKey: string;
  purpose: string;
  duration: string;
}

export interface StatusIncident {
  title: string;
  stage: string;
  time: string;
  components: string;
  impact: string;
}

export const NOX = raw as unknown as Nox;

export const SITE_URL = "https://noxtill.com";

/** Route for a policy key (`terms`, `privacy`, `dns`, `productTerms`, …), optionally with an anchor. */
export function legalHref(key: string, anchor?: string): string {
  const base = NOX.legal.policyRoutes[key] ?? "/legal";
  return anchor ? `${base}#${anchor}` : base;
}

export function routeOf(key: string): NoxRoute {
  const r = NOX.routes.find((x) => x.key === key);
  if (!r) throw new Error(`Unknown legal route key: ${key}`);
  return r;
}

/** A rendered block, after tier filtering. `isNote` is the neutral "pending validation" placeholder. */
export interface VisibleBlock {
  x?: string;
  items?: string[];
  isP?: boolean;
  isUl?: boolean;
  isQuote?: boolean;
  isNote?: boolean;
}

export interface VisibleSection {
  id: string;
  num: string;
  title: string;
  blocks: VisibleBlock[];
}

const PENDING_NOTE =
  "Additional wording for this clause is pending legal and engineering validation and will be published once confirmed.";

/** What a public reader sees: public blocks as-is, pending clauses collapsed into one neutral note, internal never. */
export function visibleSections(sections: NoxSection[]): VisibleSection[] {
  return sections
    .map((s) => {
      const out: VisibleBlock[] = [];
      for (const b of s.blocks) {
        if (b.tier === "public") out.push({ x: b.x, items: b.items, isP: b.isP, isUl: b.isUl, isQuote: b.isQuote });
        else if (b.tier === "pending" && !out[out.length - 1]?.isNote) out.push({ isNote: true, x: PENDING_NOTE });
      }
      return { id: s.id, num: s.num, title: s.title, blocks: out };
    })
    .filter((s) => s.blocks.length > 0);
}

/** Public paragraph texts of a section. */
export function paras(s: NoxSection | undefined): string[] {
  return (s?.blocks ?? []).filter((b) => b.tier === "public" && b.isP && b.x).map((b) => b.x as string);
}

/** First public bullet list of a section, with trailing list punctuation stripped. */
export function bullets(s: NoxSection | undefined): string[] {
  const ul = (s?.blocks ?? []).find((b) => b.isUl && b.tier === "public");
  return (ul?.items ?? []).map(trimItem);
}

export function trimItem(x: string): string {
  return x.replace(/;$|; and$|\.$/, "");
}

export function capitalize(x: string): string {
  return x ? x[0].toUpperCase() + x.slice(1) : x;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export const EFFECTIVE_LABEL = NOX.doc.effective ?? "Set on publication";

/** Props for <PolicyMeta /> — version, dates and version history of the current policy set. */
export const META_DOC = {
  version: NOX.doc.version,
  lastUpdated: NOX.doc.lastUpdated,
  lastUpdatedISO: NOX.doc.lastUpdatedISO,
  effective: EFFECTIVE_LABEL,
  history: NOX.history,
};

/** Page metadata from the content layer's SEO table (Appendix G of the master document). */
export function legalMetadata(route: string): Metadata {
  const seo = NOX.seo[route];
  const url = `${SITE_URL}${route}`;
  const image = `${SITE_URL}/legal/og-trust.png`;
  return {
    title: { absolute: seo.title },
    description: seo.description,
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: seo.title,
      description: seo.description,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title: seo.h1 === "Terms of Service" ? "Noxtill Terms of Service" : seo.title, description: seo.description, images: [image] },
  };
}

const ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "Noxtill",
  legalName: "Noxtill LLC",
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/legal/noxtill-logo.png`,
  address: {
    "@type": "PostalAddress",
    streetAddress: "4539 N 22ND ST STE R",
    addressLocality: "Phoenix",
    addressRegion: "AZ",
    postalCode: "85016",
    addressCountry: "US",
  },
  contactPoint: [
    { "@type": "ContactPoint", contactType: "customer support", email: "support@noxtill.com", telephone: "+1-808-998-5302" },
    { "@type": "ContactPoint", contactType: "sales", email: "sales@noxtill.com" },
    { "@type": "ContactPoint", contactType: "privacy", email: "privacy@noxtill.com" },
  ],
};

const CRUMB_URLS: Record<string, string> = { Home: "/", Legal: "/trust", "Trust Center": "/trust" };

/** JSON-LD graph: page type + BreadcrumbList + Organization, as each design file's <helmet> declares. */
export function legalJsonLd(route: string, pageType: string = "WebPage"): string {
  const seo = NOX.seo[route];
  const url = `${SITE_URL}${route}`;
  const crumbs = seo.breadcrumb.map((name, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name,
    item: i === seo.breadcrumb.length - 1 ? url : `${SITE_URL}${CRUMB_URLS[name] ?? "/"}`,
  }));
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": pageType,
        "@id": `${url}#webpage`,
        url,
        name: seo.h1,
        description: seo.description,
        dateModified: NOX.doc.lastUpdatedISO,
        inLanguage: "en-US",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        publisher: { "@id": `${SITE_URL}/#organization` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: crumbs },
      ORGANIZATION,
    ],
  }).replace(/</g, "\\u003c");
}
