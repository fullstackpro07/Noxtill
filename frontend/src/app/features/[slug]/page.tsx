import type { Metadata } from "next";
import { NpPage, npMetadata, npSlugs } from "@/components/site/dc/np-page";

export const dynamicParams = false;

export function generateStaticParams() {
  return npSlugs("features").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return npMetadata("features--" + (await params).slug);
}

/** One page per module feature (the footer's "Everything Your Business Needs") — docs/Noxtill Pages. */
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <NpPage pageKey={"features--" + (await params).slug} />;
}
