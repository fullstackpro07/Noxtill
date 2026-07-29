import { PublicBookingFlow } from "@/components/public/public-booking-flow";

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  await params;
  return <PublicBookingFlow businessName="Sunset Hair Studio" />;
}
