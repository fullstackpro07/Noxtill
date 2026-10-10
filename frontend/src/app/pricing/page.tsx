import type { Metadata } from "next";
import { PpPage, ppMetadata } from "@/components/site/dc/pp-page";

export function generateMetadata(): Promise<Metadata> {
  return ppMetadata("pricing", "/pricing");
}

/** /pricing — docs/Noxtill pricing page built/Noxtill Pricing.dc.html. */
export default function Page() {
  return <PpPage pageKey="pricing" />;
}
