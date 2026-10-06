import { LegalShell } from "@/components/site/legal/legal-shell";
import { legalMetadata } from "@/lib/marketing/legal/nox";
import { ContactView } from "./contact-view";

const ROUTE = "/contact";
export const metadata = legalMetadata(ROUTE);

export default function ContactPage() {
  return (
    <LegalShell route={ROUTE} pageType="ContactPage">
      <ContactView />
    </LegalShell>
  );
}
