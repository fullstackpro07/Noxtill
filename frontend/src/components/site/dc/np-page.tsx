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

const AGENT_PAGE_KEYS = new Set([
  "features--ai-receptionist",
  "features--ai-sales-agent",
  "features--ai-booking-agent",
  "features--ai-support-agent",
  "features--ai-marketing-agent",
  "features--ai-seo-agent",
  "features--ai-business-assistant",
  "features--ai-agents-and-workflows",
]);

const WIDE_FEATURE_KEYS = new Set(["features--video-meetings", "features--screen-sharing", "features--audio-conference-calls"]);

export async function NpPage({ pageKey }: { pageKey: string }) {
  const page = await load(pageKey);
  if (!page) notFound();
  const Body = NP_PAGES[pageKey].Body;
  // Industry pages are drawn at a fixed 1500px width with pixel-placed content.
  const fitDesign = pageKey.startsWith("industries--");
  // Strictly render our main site header on every page.
  const withHeader = true;

  // Agent pages and 1040px feature designs scale to fit desktop screens without side padding
  const isAgent =
    AGENT_PAGE_KEYS.has(pageKey) ||
    pageKey.startsWith("agents--") ||
    pageKey.includes("-agent") ||
    pageKey === "features--ai-receptionist" ||
    pageKey === "features--ai-business-assistant";

  const is1040Feature =
    pageKey.startsWith("features--") &&
    !pageKey.includes("quick-checkout") &&
    !pageKey.includes("powered-operations") &&
    // Designed at ~1240px (responsive), not 1040px: zooming them up makes type far too large.
    !WIDE_FEATURE_KEYS.has(pageKey) &&
    // Responsive (non-1024px) designs have no [data-z] containers; they size themselves, so don't zoom them.
    JSON.stringify(page.tree).includes('"data-z"');

  const extraEffects = [
    ...(isAgent || is1040Feature ? [pageKey === "features--local-seo" ? "fit1040Md" : "fit1040"] : []),
    ...(pageKey.startsWith("features--") ? ["fitMocks"] : []),
  ];

  return (
    <DcPage
      page={page}
      withHeader={withHeader}
      fontClass={npFontVars}
      fitDesign={fitDesign}
      effects={extraEffects}
      body={Body ? <Body tree={dcBody(page)} /> : undefined}
      ctx={CTX[pageKey]}
    />
  );
}

/** Route keys under a prefix ("industries" → ["automotive", …]) for generateStaticParams. */
export function npSlugs(prefix: string): string[] {
  return Object.keys(NP_PAGES)
    .filter((k) => k.startsWith(prefix + "--") && k.split("--").length === 2)
    .map((k) => k.slice(prefix.length + 2));
}
