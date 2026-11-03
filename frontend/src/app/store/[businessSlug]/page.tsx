import { PublicCheckoutView } from "@/components/public-storefront/public-checkout-view";

export default async function PublicStorePage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  return <PublicCheckoutView businessSlug={businessSlug} />;
}
