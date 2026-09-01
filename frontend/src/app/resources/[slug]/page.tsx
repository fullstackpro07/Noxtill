import type { Metadata } from "next";
import type { ComponentType } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailHero, DetailComparison, DetailRelated } from "@/components/site/detail-page-sections";
import { RESOURCES_DETAIL_PAGES, findResourceDetailPage } from "@/lib/marketing/resources-detail-content";
import { NoShowCostCalculatorTool } from "@/components/site/tools/no-show-cost-calculator-tool";
import { ProfitMarginCalculatorTool } from "@/components/site/tools/profit-margin-calculator-tool";
import { ReviewResponseGeneratorTool } from "@/components/site/tools/review-response-generator-tool";
import { QrCodeGeneratorTool } from "@/components/site/tools/qr-code-generator-tool";
import { BusinessHealthCheckTool } from "@/components/site/tools/business-health-check-tool";

const TOOL_COMPONENTS: Record<string, ComponentType> = {
  "no-show-cost-calculator": NoShowCostCalculatorTool,
  "profit-margin-calculator": ProfitMarginCalculatorTool,
  "review-response-generator": ReviewResponseGeneratorTool,
  "qr-code-generator": QrCodeGeneratorTool,
  "business-health-check": BusinessHealthCheckTool,
};

export function generateStaticParams() {
  return RESOURCES_DETAIL_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = findResourceDetailPage(slug);
  if (!page) return {};

  const url = `https://noxtill.com/resources/${page.slug}/`;
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title: page.metaTitle, description: page.metaDescription },
    twitter: { card: "summary_large_image", title: page.metaTitle },
  };
}

export default async function ResourceDetailRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = findResourceDetailPage(slug);
  if (!page) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
          { "@type": "ListItem", position: 2, name: "Resources", item: "https://noxtill.com/resources/" },
          { "@type": "ListItem", position: 3, name: page.name, item: `https://noxtill.com/resources/${page.slug}/` },
        ],
      },
      {
        "@type": "Article",
        headline: page.metaTitle,
        description: page.metaDescription,
        url: `https://noxtill.com/resources/${page.slug}/`,
      },
    ],
  };

  const Tool = TOOL_COMPONENTS[page.slug];

  return (
    <div data-theme="light" className="flex min-h-dvh flex-col bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="flex-1">
        <nav aria-label="Breadcrumb" className="mx-auto max-w-[1000px] px-5 pt-5 text-[12.5px] text-fg-faint sm:px-7">
          <Link href="/" className="hover:text-fg-muted">
            Home
          </Link>{" "}
          ›{" "}
          <Link href="/resources" className="hover:text-fg-muted">
            Resources
          </Link>{" "}
          › <span className="text-fg-muted">{page.name}</span>
        </nav>

        <DetailHero icon={page.icon} eyebrow={page.group} h1Lead={page.h1Lead} h1Highlight={page.h1Highlight} subhead={page.subhead} stats={page.stats} />

        {Tool ? (
          <section className="px-5 pt-14 sm:px-7 sm:pt-16">
            <div className="mx-auto max-w-[820px]">
              <Tool />
            </div>
          </section>
        ) : null}

        <DetailComparison
          heading={`${page.name}: before and after`}
          without={page.without}
          withList={page.withList}
          pullQuote={page.pullQuote}
          benefits={page.benefits}
        />

        <DetailRelated heading="Related resources" links={page.related} />

        <section className="px-5 pb-16 pt-14 text-center sm:px-7">
          <p className="text-sm text-fg-faint">
            Looking for something else?{" "}
            <Link href="/resources" className="font-medium text-primary hover:underline">
              See all Resources
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
