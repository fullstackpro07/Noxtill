import type { Metadata } from "next";
import { PpPage, ppMetadata } from "@/components/site/dc/pp-page";

/** Same page as /trust; /trust stays the canonical URL so search engines index one copy. */
export function generateMetadata(): Promise<Metadata> {
  return ppMetadata("trust", "/trust");
}

/** /legal — the Legal & Trust Center (docs/Noxtill pricing page built/trust.dc.html), also at /trust. */
export default function Page() {
  return <PpPage pageKey="trust" />;
}
