import type { Metadata } from "next";
import { NpPage, npMetadata } from "@/components/site/dc/np-page";

export function generateMetadata(): Promise<Metadata> {
  return npMetadata("features--ai-booking-agent");
}

export default function Page() {
  return <NpPage pageKey="features--ai-booking-agent" />;
}
