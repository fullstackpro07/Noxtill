import { SignPage } from "@/components/contracts/sign-public";

export const metadata = { title: "Sign document", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SignPage token={token} />;
}
