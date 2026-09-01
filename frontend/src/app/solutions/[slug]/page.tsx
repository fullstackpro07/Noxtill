import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { DetailHero, DetailComparison, DetailRelated } from "@/components/site/detail-page-sections";
import { SOLUTIONS_DETAIL_PAGES, findSolutionsDetailPage } from "@/lib/marketing/solutions-detail-content";

export function generateStaticParams() {
  return SOLUTIONS_DETAIL_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = findSolutionsDetailPage(slug);
  if (!page) return {};

  const url = `https://noxtill.com/solutions/${page.slug}/`;
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title: page.metaTitle, description: page.metaDescription },
    twitter: { card: "summary_large_image", title: page.metaTitle },
  };
}

export default async function SolutionsDetailRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = findSolutionsDetailPage(slug);
  if (!page) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://noxtill.com/" },
          { "@type": "ListItem", position: 2, name: "Solutions", item: "https://noxtill.com/solutions/" },
          { "@type": "ListItem", position: 3, name: page.name, item: `https://noxtill.com/solutions/${page.slug}/` },
        ],
      },
      {
        "@type": "Article",
        headline: page.metaTitle,
        description: page.metaDescription,
        url: `https://noxtill.com/solutions/${page.slug}/`,
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
          <Link href="/solutions" className="hover:text-fg-muted">
            Solutions
          </Link>{" "}
          › <span className="text-fg-muted">{page.name}</span>
        </nav>

        <DetailHero
          icon={page.icon}
          eyebrow={page.kind === "type" ? "Business type" : "Business need"}
          h1Lead={page.h1Lead}
          h1Highlight={page.h1Highlight}
          subhead={page.subhead}
          stats={page.stats}
        />

        <DetailComparison
          heading={`${page.name}: before and after`}
          without={page.without}
          withList={page.withList}
          pullQuote={page.pullQuote}
          benefits={page.benefits}
        />

        <section className="px-5 pt-14 sm:px-7 sm:pt-16">
          <div className="mx-auto max-w-[900px] text-center">
            <h2 className="mb-5 font-display text-xl font-semibold text-fg">Noxtill modules used here</h2>
            <div className="flex flex-wrap justify-center gap-2.5">
              {page.modules.map((mod) => (
                <Link
                  key={mod.href}
                  href={mod.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-4 py-2 text-[13.5px] font-medium text-fg hover:border-primary hover:text-primary"
                >
                  {mod.name}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <DetailRelated heading={page.kind === "type" ? "Other business types" : "Other things Noxtill solves"} links={page.related} />

        <section className="px-5 pb-16 pt-14 text-center sm:px-7">
          <p className="text-sm text-fg-faint">
            Not quite what you&apos;re looking for?{" "}
            <Link href="/solutions" className="font-medium text-primary hover:underline">
              See every business type Noxtill supports
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
