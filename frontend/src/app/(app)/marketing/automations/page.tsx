import { AutomationsView } from "@/components/marketing/automations-view";

export default async function MarketingAutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ newTrigger?: string }>;
}) {
  const { newTrigger } = await searchParams;
  return <AutomationsView initialTriggerKey={newTrigger} />;
}
