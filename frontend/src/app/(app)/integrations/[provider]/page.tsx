import { redirect } from "next/navigation";

/** A provider's own URL (e.g. /integrations/shopify) opens that connection in the Integrations drawer. */
export default async function ProviderRedirect({ params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  redirect(`/integrations?provider=${encodeURIComponent(provider)}`);
}
