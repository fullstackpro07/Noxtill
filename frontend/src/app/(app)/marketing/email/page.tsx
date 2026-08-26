"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { EmailMarketingView } from "@/components/integrations/email/email-marketing-view";

export default function MarketingEmailPage() {
  return (
    <SubscreenShell title="Email Marketing">
      <EmailMarketingView />
    </SubscreenShell>
  );
}
