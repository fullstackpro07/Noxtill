import type { Metadata } from "next";
import { LegalPageLayout, LegalBlocks } from "@/components/site/legal-page-layout";
import { TERMS_OF_SERVICE_BLOCKS } from "@/lib/marketing/legal/terms-of-service-content";

export const metadata: Metadata = {
  title: "Terms of Service | Noxtill",
  description: "The terms governing your use of Noxtill's business management platform.",
};

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="Version 1.0">
      <LegalBlocks blocks={TERMS_OF_SERVICE_BLOCKS} />
    </LegalPageLayout>
  );
}
