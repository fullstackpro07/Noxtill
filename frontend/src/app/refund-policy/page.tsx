import type { Metadata } from "next";
import { LegalPageLayout, LegalBlocks } from "@/components/site/legal-page-layout";
import { REFUND_POLICY_BLOCKS } from "@/lib/marketing/legal/refund-policy-content";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy | Noxtill",
  description: "Noxtill's trial, billing, cancellation and refund terms.",
};

export default function RefundPolicyPage() {
  return (
    <LegalPageLayout title="Refund & Cancellation Policy" lastUpdated="Version 1.0">
      <LegalBlocks blocks={REFUND_POLICY_BLOCKS} />
    </LegalPageLayout>
  );
}
