import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { SiteView } from "@/components/public-site/site-renderer";
import type { PublicSiteResponse } from "@/lib/website-api";

// Server-side fetch of the live deployment; same base-URL rule as the browser API client.
const API =
  process.env.NEXT_PUBLIC_API_URL && /^https?:/.test(process.env.NEXT_PUBLIC_API_URL)
    ? process.env.NEXT_PUBLIC_API_URL
    : process.env.INTERNAL_BACKEND_URL || "http://127.0.0.1:5000/api/v1";

type Params = { params: Promise<{ businessSlug: string; path?: string[] }>; searchParams: Promise<{ q?: string }> };

async function load(slug: string, path: string[] | undefined, q?: string): Promise<PublicSiteResponse> {
  const qs = new URLSearchParams({ path: `/${(path ?? []).map(encodeURIComponent).join("/")}` });
  if (q) qs.set("q", q.slice(0, 100));
  const res = await fetch(`${API}/public/website/${encodeURIComponent(slug)}?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) return { state: "not_found" };
  return (await res.json()) as PublicSiteResponse;
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { businessSlug, path } = await params;
  const { q } = await searchParams;
  const data = await load(businessSlug, path, q);
  if (data.state !== "ok") return { robots: { index: false } };
  const v = data.view;
  const title = v.type === "page" || v.type === "post" ? v.metaTitle : v.title;
  return {
    title: `${title} | ${data.site.name}`,
    description: v.type === "page" || v.type === "post" ? (v.metaDescription ?? undefined) : undefined,
    robots: data.site.indexable && data.status !== 404 && v.type !== "search" ? undefined : { index: false, follow: data.site.indexable },
    icons: data.theme.faviconUrl ? { icon: data.theme.faviconUrl } : undefined,
  };
}

export default async function HostedSitePage({ params, searchParams }: Params) {
  const { businessSlug, path } = await params;
  const { q } = await searchParams;
  const data = await load(businessSlug, path, q);

  if (data.state === "redirect") {
    if (data.permanent) permanentRedirect(data.to);
    redirect(data.to);
  }
  if (data.state === "not_found") notFound();
  if (data.state === "not_published" || data.state === "maintenance") {
    const theme = data.state === "maintenance" ? data.theme : null;
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: theme?.colors.background ?? "#fff", color: theme?.colors.text ?? "#111827", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
        <div>
          <h1 style={{ margin: "0 0 8px" }}>{data.businessName}</h1>
          <p style={{ margin: 0 }}>{data.state === "maintenance" ? data.message : "This website isn't published yet."}</p>
        </div>
      </main>
    );
  }
  return <SiteView data={data} slug={businessSlug} />;
}
