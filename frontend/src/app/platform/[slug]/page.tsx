import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DcPage, dcBody, dcMetadata } from "@/components/site/dc/dc-page";
import { DocumentsBody } from "@/components/site/dc/bodies/documents-body";
import { FinanceBody } from "@/components/site/dc/bodies/finance-body";
import { PLATFORM_PAGES, loadDcPage } from "@/lib/marketing/dc/pages-index";
import { NpPage, npMetadata, npSlugs } from "@/components/site/dc/np-page";

export const dynamicParams = false;

export function generateStaticParams() {
  return [...Object.keys(PLATFORM_PAGES), ...npSlugs("platform")].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (npSlugs("platform").includes(slug)) return npMetadata("platform--" + slug);
  const page = await loadDcPage(PLATFORM_PAGES[slug]);
  return page ? dcMetadata(page) : {};
}

/** Platform module landing pages — docs/Noxtill Header Build/<Module>.dc.html and docs/Noxtill Pages. */
export default async function PlatformModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (npSlugs("platform").includes(slug)) return <NpPage pageKey={"platform--" + slug} />;
  const page = await loadDcPage(PLATFORM_PAGES[slug]);
  if (!page) notFound();
  const body =
    slug === "finance-accounting" ? <FinanceBody tree={dcBody(page)} /> : slug === "documents-esign" ? <DocumentsBody tree={dcBody(page)} /> : undefined;
  return <DcPage page={page} body={body} />;
}
