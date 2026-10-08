import { CareersPage } from "@/components/people/careers-public";

export const metadata = { title: "Careers" };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CareersPage slug={slug} />;
}
