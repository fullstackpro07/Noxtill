import type { Metadata } from "next";
import { PpPage, ppMetadata } from "@/components/site/dc/pp-page";

export function generateMetadata(): Promise<Metadata> {
  return ppMetadata("trust", "/trust");
}

/** /trust — the Legal & Trust Center (docs/Noxtill pricing page built/trust.dc.html). */
export default function Page() {
  return <PpPage pageKey="trust" />;
}
