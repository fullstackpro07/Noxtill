import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { jakarta } from "@/components/site/legal/fonts";
import { DcEffects } from "./dc-effects";
import { renderDc, type DcContext, type DcNode, type DcPageData } from "./dc-render";
import "./dc.css";
import "./dc-responsive.css";

/** Next metadata from a design's <helmet> (title, description, canonical, robots, Open Graph, Twitter). */
export function dcMetadata(page: DcPageData): Metadata {
  const meta = new Map((page.head.meta ?? []).map(([, k, v]) => [k, v]));
  const robots = meta.get("robots");
  return {
    title: { absolute: page.head.title ?? "Noxtill" },
    description: meta.get("description"),
    alternates: page.head.canonical ? { canonical: page.head.canonical } : undefined,
    robots: robots ?? undefined,
    openGraph: {
      type: (meta.get("og:type") as "website" | "article" | undefined) ?? "website",
      siteName: meta.get("og:site_name"),
      locale: meta.get("og:locale"),
      url: meta.get("og:url"),
      title: meta.get("og:title"),
      description: meta.get("og:description"),
      images: meta.get("og:image") ? [{ url: meta.get("og:image")!, alt: meta.get("og:image:alt") }] : undefined,
      ...(meta.get("article:published_time") ? { publishedTime: meta.get("article:published_time"), modifiedTime: meta.get("article:modified_time") } : {}),
    },
    twitter: {
      card: (meta.get("twitter:card") as "summary_large_image" | undefined) ?? "summary_large_image",
      title: meta.get("twitter:title"),
      description: meta.get("twitter:description"),
      images: meta.get("twitter:image") ? [meta.get("twitter:image")!] : undefined,
    },
  };
}

export const DC_IMPORTS: Record<string, ReactNode> = {
  NoxtillHeader: <SiteHeader />,
  NoxtillFooter: <SiteFooter />,
};

function isImport(n: DcNode) {
  return typeof n !== "string" && n[0] === "dc-import";
}

/** A design's own top-level <footer> (Home has one) — replaced by the site-wide SiteFooter. */
function isDesignFooter(n: DcNode) {
  return typeof n !== "string" && n[0] === "footer";
}

/** The design's top-level nodes other than the shared header/footer imports and its own footer. */
export function dcBody(page: DcPageData): DcNode[] {
  return page.tree.filter((n) => !isImport(n) && !isDesignFooter(n) && !(typeof n === "string" && !n.trim()));
}

/**
 * A marketing page rendered from its design. The header import renders as SiteHeader and the page
 * always ends with SiteFooter; everything else renders inside `.dcx` with the design's own (scoped) CSS. Pages with
 * component logic pass `body` (a client DcHost); static pages render on the server.
 */
export function DcPage({
  page,
  body,
  effects = [],
  ctx,
  withHeader,
  fontClass,
}: {
  page: DcPageData;
  body?: ReactNode;
  effects?: string[];
  /** Render context for the server-rendered body (node swaps). */
  ctx?: DcContext;
  /** Force the site header (imported pages had their own nav stripped). Default: the design's import. */
  withHeader?: boolean;
  /** Extra font-variable classes for the body wrapper (fonts the design loads). */
  fontClass?: string;
}) {
  const imports = page.tree.filter(isImport) as [string, Record<string, string>, DcNode[]][];
  const header = withHeader ?? imports.some((n) => n[1].name === "NoxtillHeader");
  return (
    <div data-theme="light">
      {(page.head.jsonLd ?? []).map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      ))}
      {header ? DC_IMPORTS.NoxtillHeader : null}
      <div className={`dcx ${jakarta.variable}${fontClass ? " " + fontClass : ""}`}>
        <style dangerouslySetInnerHTML={{ __html: page.css }} />
        {body ?? renderDc(dcBody(page), {}, ctx)}
      </div>
      {/* Every marketing page keeps the existing site footer, whatever footer the design shows. */}
      {DC_IMPORTS.NoxtillFooter}
      <DcEffects effects={[...page.effects, ...effects]} />
    </div>
  );
}
