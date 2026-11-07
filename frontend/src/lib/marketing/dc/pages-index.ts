import type { DcPageData } from "@/components/site/dc/dc-render";

type Loader = () => Promise<{ default: unknown }>;

/** Pages converted from `docs/Noxtill Header Build` and `docs/Features pages`, by route. */
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
  "ai-agents-small-business-human-oversight": () => import("./pages/blog--ai-agents-small-business-human-oversight.json"),
  "ai-photo-digitizer-for-small-business-paper-records": () => import("./pages/blog--ai-photo-digitizer-for-small-business-paper-records.json"),
  "ai-receptionist-for-small-business": () => import("./pages/blog--ai-receptionist-for-small-business.json"),
  "all-in-one-business-software-small-business": () => import("./pages/blog--all-in-one-business-software-small-business.json"),
  "appointment-scheduling-for-small-business": () => import("./pages/blog--appointment-scheduling-for-small-business.json"),
  "autonomous-commerce-small-business": () => import("./pages/blog--autonomous-commerce-small-business.json"),
  "business-intelligence-small-business": () => import("./pages/blog--business-intelligence-small-business.json"),
  "field-service-management-small-business": () => import("./pages/blog--field-service-management-small-business.json"),
  "review-management-for-small-business": () => import("./pages/blog--review-management-for-small-business.json"),
  "small-business-automation-ideas": () => import("./pages/blog--small-business-automation-ideas.json"),
  "small-business-crm-playbook": () => import("./pages/blog--small-business-crm-playbook.json"),
  "small-business-operations-playbook": () => import("./pages/blog--small-business-operations-playbook.json"),
  "small-business-pos-system-guide": () => import("./pages/blog--small-business-pos-system-guide.json"),
  "small-business-seo-practical-system": () => import("./pages/blog--small-business-seo-practical-system.json"),
  "small-business-workflow-automation": () => import("./pages/blog--small-business-workflow-automation.json"),
  "unified-inbox-small-business": () => import("./pages/blog--unified-inbox-small-business.json"),
};

export async function loadDcPage(loader: Loader | undefined): Promise<DcPageData | null> {
  if (!loader) return null;
  return (await loader()).default as DcPageData;
}
