import type { Metadata } from "next";
import { NpPage, npMetadata, npSlugs } from "@/components/site/dc/np-page";

export const dynamicParams = false;

export function generateStaticParams() {
  return npSlugs("industries").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return npMetadata("industries--" + (await params).slug);
}

/** Industry landing pages — docs/Noxtill Pages (imported from Claude Design). */
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <NpPage pageKey={"industries--" + (await params).slug} />;
}
