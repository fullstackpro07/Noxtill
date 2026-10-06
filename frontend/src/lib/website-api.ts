import { apiFetch } from "@/lib/api-client";

export type PageKind = "page" | "landing" | "post";
export type PageStatus = "draft" | "scheduled" | "published" | "unpublished";
export type BlockType = "hero" | "text" | "image" | "cta" | "faq" | "products" | "reviews" | "contact" | "form" | "booking";
export type Block = { id: string; type: BlockType } & Record<string, unknown>;

export interface PageSummary {
  id: string;
  kind: PageKind;
  title: string;
  slug: string;
  path: string;
  status: PageStatus;
  version: number;
  publishedVersion: number | null;
  hasUnpublishedChanges: boolean;
  blockCount: number;
  metaTitle: string | null;
  metaDescription: string | null;
  excerpt: string | null;
  heroImageUrl: string | null;
  category: string | null;
  tags: string[];
  showInHeader: boolean;
  campaignId: string | null;
  goal: string | null;
  goalTarget: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  aiDraft: boolean;
  publishAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  authorName?: string | null;
}

export interface PageDetail extends PageSummary {
  blocks: Block[];
  versions: { version: number; title: string; note: string | null; createdAt: string; actorName: string | null }[];
}

export type PageInput = Partial<Omit<PageSummary, "id" | "kind" | "path" | "status" | "version" | "publishedVersion" | "hasUnpublishedChanges" | "blockCount" | "aiDraft" | "publishAt" | "publishedAt" | "updatedAt" | "authorName">> & {
  blocks?: Block[];
  note?: string;
};

export interface Deployment {
  id: string;
  number: number;
  kind: "publish" | "rollback";
  summary: string;
  restoredFrom: number | null;
  createdAt: string;
  pageCount?: number;
  actorName?: string | null;
  live?: boolean;
}

export interface NavItem {
  id: string;
  label: string;
  type: "page" | "url" | "store" | "blog" | "booking" | "portal";
  pageId?: string;
  url?: string;
  hidden?: boolean;
  newTab?: boolean;
  children?: NavItem[];
}
export interface Navigation {
  header: NavItem[];
  footer: NavItem[];
}

export interface Theme {
  preset: string;
  colors: { primary: string; accent: string; background: string; surface: string; text: string; muted: string };
  fontHeading: string;
  fontBody: string;
  radius: number;
  buttonStyle: "solid" | "outline";
  headerStyle: "light" | "dark" | "brand";
  layoutWidth: number;
  logoUrl: string;
  faviconUrl: string;
}

export interface SiteSettings {
  siteName: string;
  tagline: string;
  homePageId: string;
  notFoundPageId: string;
  privacyPageId: string;
  searchEnabled: boolean;
  cookieBannerEnabled: boolean;
  cookieBannerText: string;
  maintenanceMessage: string;
  indexable: boolean;
}

export interface Pending {
  hasLive: boolean;
  navigation: boolean;
  theme: boolean;
  settings: boolean;
  pagesWithUnpublishedEdits: { id: string; title: string; kind: PageKind }[];
}

export interface SiteIssue {
  key: string;
  severity: "high" | "medium" | "low";
  issue: string;
  page: string | null;
  detected: string;
  impact: string;
  sourceModule: string;
  href: string;
}

export interface WebsiteOverview {
  periodDays: number;
  business: { name: string; slug: string; currency: string };
  siteStatus: "not_published" | "live" | "maintenance";
  hostedPath: string;
  lastPublish: { number: number; at: string; summary: string; by: string | null } | null;
  pending: Pending;
  kpis: {
    sessions: { value: null; availability: "not_tracked"; detail: string };
    conversion: { value: null; availability: "not_tracked"; detail: string };
    formLeads: { value: number; spamBlocked: number; failed: number; source: string };
    storefrontOrders: { value: number; total: number; source: string };
    livePages: { value: number; drafts: number; scheduled: number };
    openIssues: number;
  };
  funnel: { formsLive: number; leads: number; orders: number };
  topPages: { id: string; title: string; kind: PageKind; path: string; publishedAt: string; views: null }[];
  issues: SiteIssue[];
  recentChanges: { action: string; at: string; after: unknown }[];
  handoffs: { seo: { openIssues: number; href: string }; storeOptimizer: { openOpportunities: number; href: string } };
}

export interface FormField {
  key: string;
  label: string;
  type: "text" | "email" | "phone" | "textarea" | "select" | "checkbox";
  required: boolean;
  options: string[];
  mapTo: "name" | "phone" | "email" | "address" | "notes";
}

export interface WebsiteForm {
  id: string;
  name: string;
  fields: FormField[];
  destination: string;
  customerTag: string | null;
  consentText: string | null;
  thankYouMessage: string | null;
  status: "active" | "disabled";
  publicToken: string;
  createdAt: string;
  updatedAt: string;
  last30Days?: { accepted: number; spamBlocked: number; failed: number };
  livePages?: string[];
}

export interface FormsResponse {
  forms: WebsiteForm[];
  destinations: { key: string; label: string; available: boolean }[];
  unavailableDestinations: { key: string; label: string; reason: string }[];
}

export interface FormSubmission {
  id: string;
  status: string;
  isTest: boolean;
  customerId: string | null;
  customerName: string | null;
  createdCustomer: boolean;
  marketingConsent: boolean;
  errorReason: string | null;
  utm: Record<string, string>;
  createdAt: string;
}

export interface DomainView {
  id: string;
  hostname: string;
  status: "pending" | "verified" | "failed";
  isPrimary: boolean;
  verificationRecord: { type: string; name: string; value: string };
  lastCheckedAt: string | null;
  lastError: string | null;
  ssl: { status: "valid" | "invalid" | "not_checked"; validTo: string | null; error: string | null; checkedAt: string | null };
  createdAt: string;
}

export interface DomainsOverview {
  hostedUrl: string;
  domains: DomainView[];
  redirects: { id: string; fromPath: string; toPath: string; permanent: boolean; createdAt: string }[];
  deployments: Deployment[];
  failedScheduledPublishes: number;
  maintenanceMode: boolean;
  customDomainRouting: { available: boolean; detail: string };
}

export interface StorefrontProduct {
  productId: string;
  name: string;
  sku: string | null;
  category: string | null;
  kind: "product" | "service";
  price: number;
  stockQty: number | null;
  active: boolean;
  inStock: boolean;
  visible: boolean;
  shownOnStore: boolean;
  sortPriority: number;
  badge: string | null;
  webTitle: string | null;
  webSummary: string | null;
  issues: string[];
}

export interface StorefrontOptions {
  showPrices: boolean;
  outOfStockBehavior: "hide" | "show_unavailable";
  checkoutEnabled: boolean;
}

export interface StorefrontOverview {
  currency: string;
  storeUrlPath: string;
  options: StorefrontOptions;
  allowNegativeStock: boolean;
  kpis: { productsVisible: number; collections: number; unavailableItems: number; catalogIssues: number };
  products: StorefrontProduct[];
  collections: { id: string; name: string; slug: string; productIds: string[]; sortOrder: number; visible: boolean }[];
}

export interface BuilderStatus {
  businessName: string;
  setupCompletion: number;
  checklist: { key: string; label: string; done: boolean; count?: number }[];
  missing: string[];
  draftPagesGenerated: number;
  totalPages: number;
  bookingConfigured: boolean;
  options: { goals: string[]; pages: string[]; tones: string[] };
}

export interface BuilderResult {
  pages: { key: string; id: string; title: string; slug: string }[];
  formCreated: string | null;
  ai: string;
  pagesNeedingText: string[];
  note: string;
}

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export const websiteApi = {
  overview: (days = 30) => apiFetch<WebsiteOverview>(`/website/overview?days=${days}`),
  pages: (kind?: PageKind) => apiFetch<PageSummary[]>(`/website/pages${kind ? `?kind=${kind}` : ""}`),
  page: (id: string) => apiFetch<PageDetail>(`/website/pages/${id}`),
  createPage: (kind: PageKind, input: PageInput & { title: string }) => apiFetch<PageSummary>("/website/pages", { method: "POST", ...json({ kind, ...input }) }),
  updatePage: (id: string, input: PageInput) => apiFetch<PageSummary>(`/website/pages/${id}`, { method: "PATCH", ...json(input) }),
  duplicatePage: (id: string) => apiFetch<PageSummary>(`/website/pages/${id}/duplicate`, { method: "POST" }),
  deletePage: (id: string) => apiFetch<{ deleted: boolean }>(`/website/pages/${id}`, { method: "DELETE" }),
  restorePage: (id: string, version: number) => apiFetch<PageSummary>(`/website/pages/${id}/restore`, { method: "POST", ...json({ version }) }),
  publishPage: (id: string) => apiFetch<{ deployment: Deployment; path: string }>(`/website/pages/${id}/publish`, { method: "POST" }),
  unpublishPage: (id: string) => apiFetch<{ deployment: Deployment }>(`/website/pages/${id}/unpublish`, { method: "POST" }),
  schedulePage: (id: string, publishAt: string | null) => apiFetch<PageSummary>(`/website/pages/${id}/schedule`, { method: "POST", ...json({ publishAt }) }),

  navigation: () =>
    apiFetch<{ draft: Navigation; live: Navigation | null; pages: { id: string; title: string; slug: string; kind: PageKind; status: PageStatus; path: string }[]; issues: { itemId: string; label: string; problem: string }[]; changed: boolean }>("/website/navigation"),
  saveNavigation: (nav: Navigation) => apiFetch("/website/navigation", { method: "PUT", ...json(nav) }),
  theme: () => apiFetch<{ draft: Theme; live: Theme | null; contrast: { key: string; label: string; ratio: number; minimum: number; passes: boolean }[]; changed: boolean }>("/website/theme"),
  saveTheme: (theme: Partial<Theme>) => apiFetch("/website/theme", { method: "PUT", ...json(theme) }),
  settings: () =>
    apiFetch<{
      settings: SiteSettings;
      live: SiteSettings | null;
      maintenanceMode: boolean;
      business: { name: string; slug: string; locale: string; timezone: string; currency: string };
      pages: { id: string; title: string; status: PageStatus }[];
      changed: boolean;
    }>("/website/settings"),
  saveSettings: (settings: Partial<SiteSettings>) => apiFetch("/website/settings", { method: "PATCH", ...json(settings) }),
  setMaintenance: (enabled: boolean) => apiFetch<{ maintenanceMode: boolean }>("/website/maintenance", { method: "POST", ...json({ enabled }) }),
  pending: () => apiFetch<Pending>("/website/pending-changes"),
  publishSite: (parts?: { navigation?: boolean; theme?: boolean; settings?: boolean }) => apiFetch<Deployment>("/website/publish", { method: "POST", ...json(parts ?? {}) }),
  deployments: () => apiFetch<Deployment[]>("/website/deployments"),
  rollback: (id: string) => apiFetch<Deployment>(`/website/deployments/${id}/rollback`, { method: "POST" }),

  domains: () => apiFetch<DomainsOverview>("/website/domains"),
  addDomain: (hostname: string) => apiFetch<DomainView>("/website/domains", { method: "POST", ...json({ hostname }) }),
  verifyDomain: (id: string) => apiFetch<DomainView>(`/website/domains/${id}/verify`, { method: "POST" }),
  primaryDomain: (id: string) => apiFetch<DomainsOverview>(`/website/domains/${id}/primary`, { method: "POST" }),
  removeDomain: (id: string) => apiFetch(`/website/domains/${id}`, { method: "DELETE" }),
  addRedirect: (input: { fromPath: string; toPath: string; permanent?: boolean }) => apiFetch("/website/redirects", { method: "POST", ...json(input) }),
  removeRedirect: (id: string) => apiFetch(`/website/redirects/${id}`, { method: "DELETE" }),

  forms: () => apiFetch<FormsResponse>("/website/forms"),
  formSubmissions: (id: string) => apiFetch<FormSubmission[]>(`/website/forms/${id}/submissions`),
  createForm: (input: Partial<WebsiteForm>) => apiFetch<WebsiteForm>("/website/forms", { method: "POST", ...json(input) }),
  updateForm: (id: string, input: Partial<WebsiteForm>) => apiFetch<WebsiteForm>(`/website/forms/${id}`, { method: "PATCH", ...json(input) }),
  duplicateForm: (id: string) => apiFetch<WebsiteForm>(`/website/forms/${id}/duplicate`, { method: "POST" }),
  testForm: (id: string, values: Record<string, unknown>, marketingConsent: boolean) =>
    apiFetch<{ valid: boolean; errors: string[]; wouldWrite: null | { action: string; existingCustomer: { id: string; name: string } | null; name: string; phone: string; email: string | null; tag: string; notes: string[]; marketingConsent: boolean }; note: string }>(
      `/website/forms/${id}/test`,
      { method: "POST", ...json({ values, marketingConsent }) },
    ),

  storefront: () => apiFetch<StorefrontOverview>("/website/storefront"),
  storefrontOptions: (options: Partial<StorefrontOptions>) => apiFetch<StorefrontOptions>("/website/storefront/options", { method: "PATCH", ...json(options) }),
  storefrontProduct: (productId: string, input: Partial<Pick<StorefrontProduct, "visible" | "sortPriority" | "badge" | "webTitle" | "webSummary">>) =>
    apiFetch(`/website/storefront/products/${productId}`, { method: "PATCH", ...json(input) }),
  bulkVisibility: (productIds: string[], visible: boolean) => apiFetch("/website/storefront/visibility", { method: "POST", ...json({ productIds, visible }) }),
  createCollection: (input: { name: string; productIds: string[] }) => apiFetch("/website/storefront/collections", { method: "POST", ...json(input) }),
  updateCollection: (id: string, input: { name?: string; productIds?: string[]; visible?: boolean; sortOrder?: number }) => apiFetch(`/website/storefront/collections/${id}`, { method: "PATCH", ...json(input) }),
  deleteCollection: (id: string) => apiFetch(`/website/storefront/collections/${id}`, { method: "DELETE" }),

  builder: () => apiFetch<BuilderStatus>("/website/builder"),
  generate: (input: { goal: string; audience?: string; tone?: string; pages: string[]; productIds?: string[]; includeReviews?: boolean; useAi?: boolean }) =>
    apiFetch<BuilderResult>("/website/builder/generate", { method: "POST", ...json(input) }),
};

// Public (visitor) endpoints -------------------------------------------------------------------

export interface PublicFormSchema {
  token: string;
  name: string;
  fields: Pick<FormField, "key" | "label" | "type" | "required" | "options">[];
  consentText: string | null;
  thankYouMessage: string | null;
}

export type PublicSiteResponse =
  | { state: "not_found" }
  | { state: "not_published"; businessName: string }
  | { state: "maintenance"; businessName: string; message: string; theme: Theme }
  | { state: "redirect"; to: string; permanent: boolean }
  | {
      state: "ok";
      status?: number;
      site: {
        name: string;
        tagline: string;
        homeHref: string;
        searchHref: string | null;
        indexable: boolean;
        locale: string;
        cookieBanner: { text: string; privacyHref: string | null } | null;
      };
      theme: Theme;
      navigation: { header: PublicNavItem[]; footer: PublicNavItem[] };
      view: PublicView;
    };

export interface PublicNavItem {
  label: string;
  href: string | null;
  newTab: boolean;
  children?: PublicNavItem[];
}

export type PublicView =
  | { type: "page" | "post"; pageId: string; kind: PageKind; title: string; metaTitle: string; metaDescription: string | null; heroImageUrl: string | null; category: string | null; tags: string[]; publishedAt: string; blocks: PublicBlock[] }
  | { type: "blog_index"; title: string; posts: { title: string; slug: string; excerpt: string | null; heroImageUrl: string | null; category: string | null; tags: string[]; publishedAt: string }[] }
  | { type: "search"; title: string; query: string; results: { title: string; path: string; excerpt: string | null }[] }
  | { type: "not_found"; title: string; blocks: PublicBlock[] };

export type PublicBlock = Block & {
  products?: { id: string; name: string; summary: string | null; badge: string | null; category: string | null; price: number | null; currency: string; available: boolean; imageUrl: string | null }[];
  reviews?: { author: string; stars: number; text: string; platform: string }[];
  contact?: { phone: string | null; address: string | null };
  form?: PublicFormSchema | null;
  href?: string;
  unavailable?: boolean;
};

export function fetchPublicSite(slug: string, path: string, q?: string) {
  const params = new URLSearchParams({ path });
  if (q) params.set("q", q);
  return apiFetch<PublicSiteResponse>(`/public/website/${encodeURIComponent(slug)}?${params.toString()}`, {}, { skipAuth: true });
}

export function submitPublicForm(token: string, input: { values: Record<string, unknown>; idempotencyKey: string; marketingConsent?: boolean; company?: string; pageId?: string; utm?: Record<string, string> }) {
  return apiFetch<{ received: boolean; message: string }>(`/public/website/forms/${encodeURIComponent(token)}/submit`, { method: "POST", body: JSON.stringify(input) }, { skipAuth: true });
}
