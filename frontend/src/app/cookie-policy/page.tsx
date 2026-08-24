import type { Metadata } from "next";
import { LegalPageLayout, LegalBlocks } from "@/components/site/legal-page-layout";
import { COOKIE_POLICY_BLOCKS } from "@/lib/marketing/legal/cookie-policy-content";

export const metadata: Metadata = {
  title: "Cookie Policy | Noxtill",
  description: "How Noxtill uses cookies and similar technologies, and how to manage your choices.",
};

export default function CookiePolicyPage() {
  return (
    <LegalPageLayout title="Cookie Policy" lastUpdated="Version 1.0">
      <LegalBlocks blocks={COOKIE_POLICY_BLOCKS} />
    </LegalPageLayout>
  );
}
