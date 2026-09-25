import { Rider360View } from "@/components/delivery/rider360-view";

export default async function Rider360Page({ params }: { params: Promise<{ riderId: string }> }) {
  const { riderId } = await params;
  return <Rider360View riderId={riderId} />;
}
