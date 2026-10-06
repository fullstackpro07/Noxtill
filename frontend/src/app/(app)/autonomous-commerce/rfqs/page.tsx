import { CommerceRfqsView } from "@/components/commerce/commerce-rfqs-view";

export default async function CommerceRfqsPage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityId?: string; rfqId?: string }>;
}) {
  const { opportunityId, rfqId } = await searchParams;
  return <CommerceRfqsView sourceOpportunityId={opportunityId} rfqId={rfqId} />;
}
