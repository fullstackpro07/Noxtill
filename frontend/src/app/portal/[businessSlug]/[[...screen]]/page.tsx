import { CustomerPortalPublicView } from "@/components/customer-portal/customer-portal-public-view";

export default async function CustomerPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string; screen?: string[] }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ businessSlug, screen }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  return (
    <CustomerPortalPublicView
      businessSlug={businessSlug}
      screen={screen?.[0] ?? "home"}
      inviteToken={query.token}
    />
  );
}
