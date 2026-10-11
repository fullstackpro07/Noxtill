import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NpPage, npMetadata, npSlugs } from "@/components/site/dc/np-page";
import { TOOLS_REGISTRY } from "@/lib/tools-registry";

export const dynamicParams = false;

export function generateStaticParams() {
  const legacySlugs = npSlugs("tools");
  const newSlugs = Object.keys(TOOLS_REGISTRY);
  const all = Array.from(new Set([...legacySlugs, ...newSlugs]));
  return all.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (TOOLS_REGISTRY[slug]) {
    const tool = TOOLS_REGISTRY[slug];
    return {
      title: tool.metaTitle,
      description: tool.metaDescription,
      alternates: { canonical: `https://noxtill.com/free-tools/${slug}` },
    };
  }
  return npMetadata("tools--" + slug);
}

/** Free business tools — supports new interactive workbenches and legacy Claude design mockups. */
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (TOOLS_REGISTRY[slug]) {
    redirect(`/free-tools/${slug}`);
  }
  return <NpPage pageKey={"tools--" + slug} />;
}
