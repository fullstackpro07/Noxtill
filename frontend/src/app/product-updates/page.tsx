import type { Metadata } from "next";
import { NpPage, npMetadata } from "@/components/site/dc/np-page";

export function generateMetadata(): Promise<Metadata> {
  return npMetadata("product-updates");
}

/** /product-updates — docs/Noxtill Pages (imported from Claude Design). */
export default function Page() {
  return <NpPage pageKey="product-updates" />;
}
