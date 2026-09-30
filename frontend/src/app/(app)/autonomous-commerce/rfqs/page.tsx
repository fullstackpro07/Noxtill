import { CommerceRfqsView } from "@/components/commerce/commerce-rfqs-view";

export default async function CommerceRfqsPage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityId?: string }>;
}) {
  const { opportunityId } = await searchParams;
  return <CommerceRfqsView sourceOpportunityId={opportunityId} />;
}
