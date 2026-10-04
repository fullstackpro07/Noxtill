import { PayPage } from "@/components/payments/pay-public";

export const metadata = { title: "Pay securely", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PayPage token={token} />;
}
