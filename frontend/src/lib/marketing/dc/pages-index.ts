import type { DcPageData } from "@/components/site/dc/dc-render";

type Loader = () => Promise<{ default: unknown }>;

/** Pages converted from `docs/Noxtill Header Build` (see scripts/marketing-dc/convert.js), by route. */
export const PLATFORM_PAGES: Record<string, Loader> = {
  "assets-maintenance": () => import("./pages/platform--assets-maintenance.json"),
  "customer-portal": () => import("./pages/platform--customer-portal.json"),
  "documents-esign": () => import("./pages/platform--documents-esign.json"),
  "field-service": () => import("./pages/platform--field-service.json"),
  "finance-accounting": () => import("./pages/platform--finance-accounting.json"),
  helpdesk: () => import("./pages/platform--helpdesk.json"),
  "payments-billing": () => import("./pages/platform--payments-billing.json"),
  "people-payroll": () => import("./pages/platform--people-payroll.json"),
  procurement: () => import("./pages/platform--procurement.json"),
  "website-commerce": () => import("./pages/platform--website-commerce.json"),
};

export const AI_PAGES: Record<string, Loader> = {
  "autonomous-commerce": () => import("./pages/ai--autonomous-commerce.json"),
  "business-intelligence": () => import("./pages/ai--business-intelligence.json"),
  "seo-autopilot": () => import("./pages/ai--seo-autopilot.json"),
};

export const BLOG_PAGES: Record<string, Loader> = {
  "ai-receptionist-for-small-business": () => import("./pages/blog--ai-receptionist-for-small-business.json"),
  "all-in-one-business-software-small-business": () => import("./pages/blog--all-in-one-business-software-small-business.json"),
  "small-business-automation-ideas": () => import("./pages/blog--small-business-automation-ideas.json"),
};

export async function loadDcPage(loader: Loader | undefined): Promise<DcPageData | null> {
  if (!loader) return null;
  return (await loader()).default as DcPageData;
}
