"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import type { PageKind } from "@/lib/website-api";
import { PageManager } from "./page-manager";
import { Page } from "./website-ui";

const HEADERS: Record<PageKind, { title: string; subtitle: string }> = {
  page: { title: "Pages", subtitle: "Standard website pages, built from content blocks" },
  landing: { title: "Landing Pages", subtitle: "One offer, one goal, linked to a Marketing campaign" },
  post: { title: "Blog & Content", subtitle: "Posts with categories, tags and scheduled publishing" },
};

function KindScreen({ kind }: { kind: PageKind }) {
  useModuleHeader(HEADERS[kind]);
  return (
    <Page>
      {kind === "page" && (
        <p className="m-0 text-xs" style={{ color: "var(--app-text-muted)" }}>
          Product, price and stock blocks read live from Products and Inventory: they are never copied here. Keyword and technical SEO live in <Link className="underline" href="/marketing/seo-autopilot">SEO Autopilot</Link>.
        </p>
      )}
      {kind === "landing" && (
        <p className="m-0 text-xs" style={{ color: "var(--app-text-muted)" }}>
          Campaigns are created in Marketing; A/B tests run in <Link className="underline" href="/autonomous-commerce/experiment-lab">Experiment Lab</Link>. Conversions here count form leads that recorded this page; visits are not tracked.
        </p>
      )}
      {kind === "post" && (
        <p className="m-0 text-xs" style={{ color: "var(--app-text-muted)" }}>
          Share posts through <Link className="underline" href="/social/create">Social</Link>; SEO scoring lives in <Link className="underline" href="/marketing/seo-autopilot/content">SEO Autopilot → Content</Link>.
        </p>
      )}
      <Suspense fallback={null}>
        <PageManager kind={kind} />
      </Suspense>
    </Page>
  );
}

export function WebsitePagesView() {
  return <KindScreen kind="page" />;
}
export function WebsiteLandingPagesView() {
  return <KindScreen kind="landing" />;
}
export function WebsiteBlogView() {
  return <KindScreen kind="post" />;
}
