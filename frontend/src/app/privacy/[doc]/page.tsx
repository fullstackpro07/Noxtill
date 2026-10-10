import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PpPage, legalDoc, legalMetadata, legalSlugs } from "@/components/site/dc/pp-page";

type Params = { params: Promise<{ doc: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return legalSlugs("privacy").map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const doc = legalDoc("privacy", (await params).doc);
  return doc ? legalMetadata(doc) : {};
}

/** /privacy/<doc> — the Legal Reader design (docs/Noxtill pricing page built) for one registry document. */
export default async function Page({ params }: Params) {
  const doc = legalDoc("privacy", (await params).doc);
  if (!doc) notFound();
  return <PpPage pageKey="legal-reader" props={{ doc: doc.key }} />;
}
