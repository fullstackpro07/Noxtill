import type { Metadata } from "next";
import { NpPage, npMetadata } from "@/components/site/dc/np-page";

export function generateMetadata(): Promise<Metadata> {
  return npMetadata("files");
}

/** /files — docs/Noxtill Pages (imported from Claude Design). */
export default function Page() {
  return <NpPage pageKey="files" />;
}
