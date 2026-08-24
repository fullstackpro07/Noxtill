import type { Metadata } from "next";
import { LegalPageLayout, LegalBlocks } from "@/components/site/legal-page-layout";
import { PRIVACY_POLICY_BLOCKS } from "@/lib/marketing/legal/privacy-policy-content";

export const metadata: Metadata = {
  title: "Privacy Policy | Noxtill",
  description: "How Noxtill collects, uses and protects your data and your customers' data.",
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="Version 1.0">
      <LegalBlocks blocks={PRIVACY_POLICY_BLOCKS} />
    </LegalPageLayout>
  );
}
