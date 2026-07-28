import { notFound } from "next/navigation";
import { PublicRatingFlow } from "@/components/public/public-rating-flow";
import { getBusinessByToken } from "@/lib/public-rating";

export default async function PublicRatingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const business = getBusinessByToken(token);

  if (!business) notFound();

  return <PublicRatingFlow business={business} />;
}
