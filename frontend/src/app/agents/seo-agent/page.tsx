import type { Metadata } from "next";
import { NpPage, npMetadata } from "@/components/site/dc/np-page";

export function generateMetadata(): Promise<Metadata> {
  return npMetadata("features--ai-seo-agent");
}

export default function Page() {
  return <NpPage pageKey="features--ai-seo-agent" />;
}
