import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NP_PAGES } from "@/lib/marketing/dc/np-index";
import { BookDemoForm } from "./book-demo-form";
import { DcPage, dcBody, dcMetadata } from "./dc-page";
import { npFontVars } from "./np-fonts";
import type { DcContext, DcPageData } from "./dc-render";

/**
 * Pages imported from the Claude Design project (docs/Noxtill Pages, converter set "np"), addressed
 * by route key ("industries--hvac" = /industries/hvac). The designs' own nav bar and footer were
 * removed by the converter; every page gets the site-wide SiteHeader and SiteFooter.
 */
export const npRoute = (key: string) => "/" + key.replace(/--/g, "/");

async function load(key: string): Promise<DcPageData | null> {
  const entry = NP_PAGES[key];
  return entry ? ((await entry.load()).default as DcPageData) : null;
}

/** Metadata from the design's <helmet>, with canonical/og:url pointing at the page's real URL. */
export async function npMetadata(key: string): Promise<Metadata> {
  const page = await load(key);
  if (!page) return {};
  const md = dcMetadata(page);
  const url = "https://noxtill.com" + npRoute(key);
  return { ...md, alternates: { canonical: url }, openGraph: { ...md.openGraph, url } };
}

/** Design nodes that are placeholders in the design and real components here. */
const CTX: Record<string, DcContext> = {
  "book-a-demo": {
    replace: (node, key) => (node[0] === "form" && node[1]["aria-label"] === "Book your demo" ? <BookDemoForm key={key} node={node} /> : undefined),
  },
};

export async function NpPage({ pageKey }: { pageKey: string }) {
  const page = await load(pageKey);
  if (!page) notFound();
  const Body = NP_PAGES[pageKey].Body;
  return <DcPage page={page} withHeader fontClass={npFontVars} body={Body ? <Body tree={dcBody(page)} /> : undefined} ctx={CTX[pageKey]} />;
}

/** Route keys under a prefix ("industries" → ["automotive", …]) for generateStaticParams. */
export function npSlugs(prefix: string): string[] {
  return Object.keys(NP_PAGES)
    .filter((k) => k.startsWith(prefix + "--") && k.split("--").length === 2)
    .map((k) => k.slice(prefix.length + 2));
}
