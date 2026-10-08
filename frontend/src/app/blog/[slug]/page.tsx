import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DcPage, dcMetadata } from "@/components/site/dc/dc-page";
import { BLOG_PAGES, loadDcPage } from "@/lib/marketing/dc/pages-index";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(BLOG_PAGES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = await loadDcPage(BLOG_PAGES[(await params).slug]);
  return page ? dcMetadata(page) : {};
}

/** Blog articles — docs/Noxtill Header Build/Blog - <Article>.dc.html (TOC highlights the section in view). */
export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const page = await loadDcPage(BLOG_PAGES[(await params).slug]);
  if (!page) notFound();
  return <DcPage page={page} effects={["toc"]} />;
}
