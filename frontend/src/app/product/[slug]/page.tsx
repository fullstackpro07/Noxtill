import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailHero, DetailComparison, DetailRelated } from "@/components/site/detail-page-sections";
import { PRODUCT_DETAIL_PAGES, findProductDetailPage } from "@/lib/marketing/product-detail-content";

// "nightly-close" and "fast-sale" each have their own bespoke static page (a custom per-page
// redesign, not the shared template below) — excluded here so the routes don't collide; the
// static sibling route takes precedence for that exact path regardless, but generating it here
// too would make this file's generateStaticParams claim an unreachable path.
const BESPOKE_SLUGS = new Set(["nightly-close", "fast-sale", "orders", "bookings", "credit", "catalogue", "pnl", "inventory", "health-score", "reports", "staff", "reviews", "inbox", "marketing", "listings", "social", "multi-location", "analytics"]);

export function generateStaticParams() {
  return PRODUCT_DETAIL_PAGES.filter((p) => !BESPOKE_SLUGS.has(p.slug)).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = findProductDetailPage(slug);
  if (!page) return {};

  const url = `https://noxtill.com/product/${page.slug}/`;
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title: page.metaTitle, description: page.metaDescription },
    twitter: { card: "summary_large_image", title: page.metaTitle },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = findProductDetailPage(slug);
  if (!page) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
          { "@type": "ListItem", position: 2, name: "Product", item: "https://noxtill.com/product/" },
          { "@type": "ListItem", position: 3, name: page.name, item: `https://noxtill.com/product/${page.slug}/` },
        ],
      },
      {
        "@type": "Article",
        headline: page.metaTitle,
        description: page.metaDescription,
        url: `https://noxtill.com/product/${page.slug}/`,
      },
    ],
  };

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
          <Link href="/product" className="hover:text-fg-muted">
            Product
          </Link>{" "}
          › <span className="text-fg-muted">{page.name}</span>
        </nav>

        <DetailHero icon={page.icon} eyebrow={page.group} h1Lead={page.h1Lead} h1Highlight={page.h1Highlight} subhead={page.subhead} stats={page.stats} />

        <DetailComparison
          heading={`${page.name}: before and after`}
          without={page.without}
          withList={page.withList}
          pullQuote={page.pullQuote}
          benefits={page.benefits}
        />

        <DetailRelated heading="Related features" links={page.related} />

        <section className="px-5 pb-16 pt-14 text-center sm:px-7">
          <p className="text-sm text-fg-faint">
            Not the feature you were looking for?{" "}
            <Link href="/product" className="font-medium text-primary hover:underline">
              See every Noxtill feature
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
