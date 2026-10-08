import type { Metadata } from "next";
import { NpPage, npMetadata, npSlugs } from "@/components/site/dc/np-page";

export const dynamicParams = false;

export function generateStaticParams() {
  return npSlugs("tools").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return npMetadata("tools--" + (await params).slug);
}

/** Free business tools — docs/Noxtill Pages (imported from Claude Design). */
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <NpPage pageKey={"tools--" + (await params).slug} />;
}
