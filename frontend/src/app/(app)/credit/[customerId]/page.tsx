import { redirect } from "next/navigation";

export default async function CreditLedgerDetailRedirectPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  redirect(`/credit/customer?id=${customerId}`);
}
