import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PP_PAGES } from "@/lib/marketing/dc/pp-index";
import legal from "@/lib/marketing/dc/pp-legal.json";
import { DcPage, dcBody, dcMetadata } from "./dc-page";
import { npFontVars } from "./np-fonts";
import type { DcPageData } from "./dc-render";

/**
 * Pricing and the Legal & Trust Center (docs/Noxtill pricing page built, converter set "pp"). The
 * Legal Reader design renders every legal / privacy / trust document from the registry
 * (pp-legal.json, from the design's legal/content.js) by its `doc` key; its routes are the
 * registry's own (`/legal/terms`, `/privacy/choices`, `/trust/security`, …). The designs' own top bar
 * and footer were removed by the converter; every page gets the site-wide SiteHeader and SiteFooter.
 */

type LegalDoc = { key: string; route: string; title: string; desc: string };
const DOCS = (legal as unknown as { docs: LegalDoc[] }).docs;

async function load(key: string): Promise<DcPageData | null> {
  const entry = PP_PAGES[key];
  return entry ? ((await entry.load()).default as DcPageData) : null;
}

/** The registry document published at `/<section>/<slug>`, if any. */
export function legalDoc(section: string, slug: string): LegalDoc | undefined {
  return DOCS.find((d) => d.route === `/${section}/${slug}`);
}

/** Slugs of the registry documents under a section ("legal" → ["terms", …]) for generateStaticParams. */
export function legalSlugs(section: string): string[] {
  return DOCS.filter((d) => d.route.startsWith(`/${section}/`)).map((d) => d.route.slice(section.length + 2));
}

/** Pricing / Trust Center: metadata from the design's <helmet>. */
export async function ppMetadata(key: string, route: string): Promise<Metadata> {
  const page = await load(key);
  if (!page) return {};
  const md = dcMetadata(page);
  const url = "https://noxtill.com" + route;
  return { ...md, alternates: { canonical: url }, openGraph: { ...md.openGraph, url } };
}

/** "<doc> | Noxtill Legal & Trust Center" when that fits a search result (≤60 chars), else "<doc> | Noxtill". */
function legalTitle(title: string): string {
  const full = `${title} | Noxtill Legal & Trust Center`;
  return full.length <= 60 ? full : `${title} | Noxtill`;
}

export function legalMetadata(doc: LegalDoc): Metadata {
  const url = "https://noxtill.com" + doc.route;
  return {
    title: legalTitle(doc.title),
    description: doc.desc,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: "Noxtill",
      locale: "en_US",
      title: `${doc.title} | Noxtill`,
      description: doc.desc,
      url,
      images: [
        {
          url: "https://noxtill.com/brand/og-image.png",
          width: 1200,
          height: 630,
          alt: legalTitle(doc.title),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${doc.title} | Noxtill`,
      description: doc.desc,
      images: ["https://noxtill.com/brand/og-image.png"],
    },
  };
}

export async function PpPage({ pageKey, props }: { pageKey: string; props?: Record<string, unknown> }) {
  const page = await load(pageKey);
  if (!page) notFound();
  const Body = PP_PAGES[pageKey].Body;
  return <DcPage page={page} withHeader fontClass={npFontVars + " dcx-own"} body={Body ? <Body tree={dcBody(page)} props={props} /> : undefined} />;
}
