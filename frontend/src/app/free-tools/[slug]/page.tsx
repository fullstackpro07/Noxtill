import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TOOLS_REGISTRY } from "@/lib/tools-registry";
import { ToolPageLayout } from "@/components/site/tools/tool-page-layout";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(TOOLS_REGISTRY).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = TOOLS_REGISTRY[slug];
  if (!tool) return {};

  const url = `https://noxtill.com/free-tools/${slug}`;
  return {
    title: tool.metaTitle,
    description: tool.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: tool.metaTitle,
      description: tool.metaDescription,
      url,
      type: "website",
    },
  };
}

export default async function FreeToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = TOOLS_REGISTRY[slug];
  if (!tool) notFound();

  const Component = tool.Component;

  return (
    <ToolPageLayout
      title={tool.title}
      badge={tool.badge}
      description={tool.subtitle}
      currentSlug={slug}
      formulaInfo={tool.formulaInfo}
      faqs={tool.faqs}
    >
      <Component />
    </ToolPageLayout>
  );
}
