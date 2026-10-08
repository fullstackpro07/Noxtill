import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DcPage, dcMetadata } from "@/components/site/dc/dc-page";
import { AI_PAGES, loadDcPage } from "@/lib/marketing/dc/pages-index";
import { NpPage, npMetadata, npSlugs } from "@/components/site/dc/np-page";

export const dynamicParams = false;

export function generateStaticParams() {
  return [...Object.keys(AI_PAGES), ...npSlugs("ai")].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (npSlugs("ai").includes(slug)) return npMetadata("ai--" + slug);
  const page = await loadDcPage(AI_PAGES[slug]);
  return page ? dcMetadata(page) : {};
}

/** AI product landing pages — docs/Noxtill Header Build/<Product>.dc.html and docs/Noxtill Pages. */
export default async function AiProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (npSlugs("ai").includes(slug)) return <NpPage pageKey={"ai--" + slug} />;
  const page = await loadDcPage(AI_PAGES[slug]);
  if (!page) notFound();
  return <DcPage page={page} />;
}
