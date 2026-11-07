import { BASE_URL, ApiError } from "@/lib/api-client";
import { useSuperAdminAuth, type SuperAdminProfile } from "@/store/super-admin-auth-store";

/**
 * Super Admin API client (`/api/v1/super-admin/*`). Never sends the tenant token — only the
 * admin session from `useSuperAdminAuth`. 401 → one refresh attempt → sign out to /super-admin/login.
 */
let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const { refreshToken } = useSuperAdminAuth.getState();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE_URL}/super-admin/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string; refreshToken: string; admin: SuperAdminProfile };
    useSuperAdminAuth.getState().setSession(data);
    return true;
  } catch {
    return false;
  }
}

export async function saFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const { accessToken } = useSuperAdminAuth.getState();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const res = await fetch(`${BASE_URL}/super-admin${path}`, { ...init, headers });

  if (res.status === 401 && retry) {
    let code = "";
    try {
      code = ((await res.clone().json()) as { error?: { code?: string } }).error?.code ?? "";
    } catch {
      /* no body */
    }
    // A wrong/missing re-auth code is a 401 too — that is not a dead session.
    if (code !== "ADMIN_REAUTH_REQUIRED" && code !== "ADMIN_TOTP_INVALID") {
      refreshing ??= refresh().finally(() => {
        refreshing = null;
      });
      if (await refreshing) return saFetch<T>(path, init, false);
      useSuperAdminAuth.getState().clear();
      if (typeof window !== "undefined") window.location.assign("/super-admin/login");
      throw new ApiError(401, "ADMIN_SESSION_INVALID", "Your admin session has ended. Sign in again.");
    }
  }
  if (!res.ok) {
    let body: { error?: { code: string; message: string } } = {};
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
    const err = body.error ?? { code: "UNKNOWN_ERROR", message: res.statusText || "Something went wrong" };
    throw new ApiError(res.status, err.code, err.message);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/csv")) return (await res.text()) as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const qs = (params: Record<string, string | number | undefined | null | boolean>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

const post = <T>(path: string, body: unknown) => saFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => saFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) => saFetch<T>(path, { method: "PUT", body: JSON.stringify(body) });

export async function downloadCsv(path: string, filename: string) {
  const csv = await saFetch<string>(path);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------ types

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type LoginStage =
  | { stage: "totp"; challengeToken: string }
  | { stage: "enroll"; challengeToken: string; otpauthUrl: string; secret: string };

export interface AdminTokens {
  accessToken: string;
  refreshToken: string;
  admin: SuperAdminProfile;
}

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  owner: { id: string; name: string; email: string | null; phone: string | null } | null;
  country: string | null;
  plan: { key: string; name: string } | null;
  subscriptionStatus: string | null;
  users: { used: number; allowed: number | null };
  locations: { used: number; allowed: number | null };
  modulesEnabled: number;
  modulesTotal: number;
  createdAt: string;
  lastActivityAt: string | null;
  platformStatus: string;
}

export interface ResolvedMetric {
  code: string;
  kind: string;
  included: number | null;
  planIncluded: number | null;
  override: { id: string; expiresAt: string | null } | null;
  purchased: number;
  used: number;
  reserved: number;
  remaining: number | null;
  state: string;
  enforced: boolean;
  resetsAt: string | null;
}

export interface EntitlementSet {
  planKey: string;
  planName: string;
  status: string;
  interval: string;
  suspended: boolean;
  meteredPaused: boolean;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  billingPeriod: { start: string; end: string };
  usagePeriod: { start: string; end: string };
  metrics: Record<string, ResolvedMetric>;
  features: Record<string, boolean | null>;
  spendCaps: Record<string, { capUsd: number; spentUsd: number; reservedUsd: number; remainingUsd: number }>;
}

export interface ModuleBlock {
  state: "global_disabled" | "suspended" | "restricted";
  reason: string | null;
  expiresAt: string | null;
}

export interface TenantDetail {
  business: {
    id: string;
    name: string;
    slug: string;
    email: string | null;
    phone: string | null;
    website: string | null;
    country: string | null;
    city: string | null;
    address: string | null;
    currency: string;
    timezone: string;
    createdAt: string;
    onboardingCompletedAt: string | null;
    platformStatus: string;
    platformStatusReason: string | null;
    platformStatusAt: string | null;
    hasStripeCustomer: boolean;
    type: string | null;
    branches: { id: string; name: string; active: boolean; createdAt: string }[];
  };
  owner: { id: string; name: string; email: string | null; phone: string | null; twoFactorEnabled: boolean; platformStatus: string } | null;
  entitlements: EntitlementSet;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  recentActivity: { id: string; type: string; description: string; createdAt: string; amount: string | null }[];
  modules: { total: number; enabled: number };
  notesCount: number;
  highSeverityEvents7d: number;
}

export interface SecurityEventRow {
  id: string;
  type: string;
  severity: string;
  businessId: string | null;
  userId: string | null;
  adminId: string | null;
  identifier: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  business?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
}

export interface SessionRow {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  revokedAt?: string | null;
  businessId?: string;
  user?: { id: string; name: string; email: string | null };
  business?: { id: string; name: string };
}

// --------------------------------------------------------------- endpoints

type Q = Record<string, string | number | undefined | null | boolean>;

export const saApi = {
  login: (email: string, password: string) =>
    fetch(`${BASE_URL}/super-admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(unwrap<LoginStage>),
  verify: (challengeToken: string, code: string) =>
    fetch(`${BASE_URL}/super-admin/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken, code }),
    }).then(unwrap<AdminTokens>),
  logout: () => post<{ ok: true }>("/auth/logout", {}),
  me: () => saFetch<SuperAdminProfile>("/auth/me"),

  dashboard: (q: Q) => saFetch<DashboardSummary>(`/dashboard${qs(q)}`),
  feed: () => saFetch<{ items: FeedItem[] }>("/dashboard/feed"),

  tenants: (q: Q) => saFetch<Paged<TenantRow>>(`/tenants${qs(q)}`),
  countries: () => saFetch<string[]>("/tenants/countries"),
  tenant: (id: string) => saFetch<TenantDetail>(`/tenants/${id}`),
  tenantUsers: (id: string) => saFetch<TenantUserRow[]>(`/tenants/${id}/users`),
  tenantSecurity: (id: string) => saFetch<{ events: SecurityEventRow[]; sessions: SessionRow[] }>(`/tenants/${id}/security`),
  tenantIntegrations: (id: string) => saFetch<TenantIntegrations>(`/tenants/${id}/integrations`),
  tenantActivity: (id: string, q: Q) => saFetch<ActivityPage>(`/tenants/${id}/activity${qs(q)}`),
  tenantNotes: (id: string) => saFetch<NoteRow[]>(`/tenants/${id}/notes`),
  addNote: (id: string, body: string) => post<NoteRow>(`/tenants/${id}/notes`, { body }),
  setTenantStatus: (id: string, b: { status: string; reason: string; totpCode: string }) => patch(`/tenants/${id}/status`, b),
  revokeTenantSessions: (id: string, b: { reason: string; totpCode: string }) => post<{ revoked: number }>(`/tenants/${id}/sessions/revoke`, b),
  tenantSubscription: (id: string) => saFetch<TenantSubscription>(`/tenants/${id}/subscription`),
  assignPlan: (id: string, b: { planKey: string; interval: string; reason: string; totpCode: string }) =>
    post<TenantSubscription>(`/tenants/${id}/subscription/assign`, b),
  extendTrial: (id: string, b: { days: number; reason: string }) => post<TenantSubscription>(`/tenants/${id}/subscription/extend-trial`, b),
  cancelSubscription: (id: string, b: { reason: string; totpCode: string }) => post<TenantSubscription>(`/tenants/${id}/subscription/cancel`, b),
  undoCancel: (id: string, b: { reason: string }) => post<TenantSubscription>(`/tenants/${id}/subscription/undo-cancel`, b),
  tenantLimits: (id: string) => saFetch<TenantLimits>(`/tenants/${id}/limits`),
  createOverride: (id: string, b: { metricCode: string; includedQuantity: number; effectiveFrom?: string; expiresAt?: string; reason: string; totpCode: string }) =>
    post(`/tenants/${id}/limits/overrides`, b),
  revokeOverride: (id: string, overrideId: string, b: { reason: string; totpCode: string }) =>
    post(`/tenants/${id}/limits/overrides/${overrideId}/revoke`, b),
  tenantModules: (id: string) => saFetch<TenantModules>(`/tenants/${id}/modules`),
  setTenantModule: (id: string, key: string, b: { state: string; expiresAt?: string; reason: string }) =>
    patch<TenantModules>(`/tenants/${id}/modules/${key}`, b),
  tenantAiLedger: (id: string, q: Q) => saFetch<AiLedger>(`/tenants/${id}/ai/ledger${qs(q)}`),
  adjustCredits: (id: string, b: { delta: number; reason: string; totpCode: string }) => post<{ purchasedBalance: number }>(`/tenants/${id}/ai/adjust`, b),

  users: (q: Q) => saFetch<Paged<UserRow>>(`/users${qs(q)}`),
  user: (id: string) => saFetch<UserDetail>(`/users/${id}`),
  setUserStatus: (id: string, b: { status: string; reason: string }) => patch(`/users/${id}/status`, b),
  revokeUserSession: (id: string, sessionId: string, b: { reason: string }) => post(`/users/${id}/sessions/${sessionId}/revoke`, b),
  revokeUserSessions: (id: string, b: { reason: string }) => post<{ revoked: number }>(`/users/${id}/sessions/revoke`, b),
  sendPasswordReset: (id: string, b: { reason: string }) => post<{ sent: boolean }>(`/users/${id}/password-reset`, b),
  changeMembershipRole: (membershipId: string, b: { role: string; reason: string }) => patch(`/users/memberships/${membershipId}/role`, b),
  setMembershipActive: (membershipId: string, b: { active: boolean; reason: string }) => patch(`/users/memberships/${membershipId}/active`, b),

  plans: () => saFetch<PlansResponse>("/plans"),
  createPlan: (b: Record<string, unknown>) => post("/plans", b),
  updatePlan: (key: string, b: Record<string, unknown>) => patch(`/plans/${key}`, b),
  setPlanEntitlements: (key: string, b: { entitlements: PlanEntitlement[]; reason: string; totpCode: string }) => put(`/plans/${key}/entitlements`, b),
  subscriptions: (q: Q) => saFetch<Paged<SubscriptionRow>>(`/subscriptions${qs(q)}`),

  modules: () => saFetch<ModuleRegistry>("/modules"),
  setGlobalModule: (key: string, b: { disabled: boolean; reason: string; totpCode: string }) => patch<ModuleRegistry>(`/modules/${key}`, b),

  usage: (q: Q) => saFetch<UsageOverview>(`/usage${qs(q)}`),
  usageRecords: (q: Q) => saFetch<Paged<UsageRecord>>(`/usage/records${qs(q)}`),
  ai: (q: Q) => saFetch<AiOverview>(`/ai${qs(q)}`),
  aiBalances: (q: Q) => saFetch<Paged<AiBalanceRow>>(`/ai/balances${qs(q)}`),
  communications: (q: Q) => saFetch<CommunicationsOverview>(`/communications${qs(q)}`),

  activities: (q: Q) => saFetch<ActivityPage>(`/activities${qs(q)}`),
  security: (q: Q) => saFetch<SecurityOverview>(`/security${qs(q)}`),
  securityEvents: (q: Q) => saFetch<Paged<SecurityEventRow>>(`/security/events${qs(q)}`),
  sessions: (q: Q) => saFetch<Paged<SessionRow>>(`/sessions${qs(q)}`),
  integrations: (q: Q) => saFetch<IntegrationsPage>(`/integrations${qs(q)}`),

  admins: () => saFetch<AdminRow[]>("/admins"),
  createAdmin: (b: { email: string; name: string; roleKey: string; reason: string; totpCode: string }) =>
    post<{ admin: { id: string }; temporaryPassword: string }>("/admins", b),
  updateAdmin: (id: string, b: { roleKey?: string; status?: string; name?: string; reason: string; totpCode: string }) => patch(`/admins/${id}`, b),
  resetAdminMfa: (id: string, b: { reason: string; totpCode: string }) => post(`/admins/${id}/reset-mfa`, b),
  resetAdminPassword: (id: string, b: { reason: string; totpCode: string }) => post<{ temporaryPassword: string }>(`/admins/${id}/reset-password`, b),
  revokeAdminSessions: (id: string, b: { reason: string }) => post<{ revoked: number }>(`/admins/${id}/sessions/revoke`, b),
  roles: () => saFetch<RolesResponse>("/admins/roles/all"),
  saveRole: (key: string, b: { name?: string; description?: string; permissions: string[]; reason: string; totpCode: string }) =>
    put<RolesResponse>(`/admins/roles/${key}`, b),
  auditLog: (q: Q) => saFetch<Paged<AuditRow>>(`/admins/audit/log${qs(q)}`),
};

async function unwrap<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = (body as { error?: { code: string; message: string } }).error ?? { code: "UNKNOWN_ERROR", message: res.statusText };
    throw new ApiError(res.status, err.code, err.message);
  }
  return body as T;
}

// ------------------------------------------------------------ more types

export interface DashboardSummary {
  timezone: string;
  range: { from: string | null; to: string | null };
  kpis: {
    totalBusinesses: number;
    activeBusinesses: number;
    trialBusinesses: number;
    suspendedBusinesses: number;
    archivedBusinesses: number;
    totalUsers: number;
    activeUsers30d: number;
    mrrUsd: number;
    arrUsd: number;
    activeSubscriptions: number;
    pastDueSubscriptions: number;
    pausedSubscriptions: number;
    cancellingSubscriptions: number;
    businessesWithoutSubscriptionRecord: number;
    aiCreditsConsumed: number;
    meteredEvents: number;
  };
  revenueBasis: string;
  trends: Record<"businessRegistrations" | "userRegistrations" | "dailySignIns" | "failedLogins", { date: string; count: number }[]>;
  subscriptions: {
    byPlan: { key: string; name: string; count: number }[];
    byStatus: { status: string; count: number }[];
    trialConversions: number;
    trialsEndedWithoutPlan: number;
    cancellations: number;
  };
  modules: { key: string; label: string; enabledFor: number }[];
  communications: { whatsapp: number; sms: number; email: number };
  notTracked: string[];
}

export interface FeedItem {
  kind: string;
  at: string;
  title: string;
  href: string;
  severity: string | null;
}

export interface TenantUserRow {
  membershipId: string;
  role: string;
  customRole: string | null;
  membershipActive: boolean;
  location: { id: string; name: string };
  joinedAt: string;
  user: { id: string; name: string; email: string | null; phone: string | null; twoFactorEnabled: boolean; platformStatus: string; lockedUntil: string | null };
  lastLoginAt: string | null;
  lastActiveAt: string | null;
}

export interface TenantIntegrations {
  integrations: { id: string; businessId: string; provider: string; status: string; connectedAt: string | null; lastSyncAt: string | null; pausedAt: string | null; updatedAt: string }[];
  syncLogs: { id: string; provider: string; success: boolean; recordsProcessed: number; recordsFailed: number; message: string | null; createdAt: string }[];
}

export interface ActivityItem {
  id: string;
  business?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
  module?: string;
  action: string;
  resource?: string | null;
  amount?: number | null;
  before?: unknown;
  after?: unknown;
  details?: unknown;
  createdAt: string;
}

export interface ActivityPage extends Paged<ActivityItem> {
  source: string;
}

export interface NoteRow {
  id: string;
  adminName: string;
  body: string;
  createdAt: string;
}

export interface TenantSubscription {
  subscription: {
    id: string;
    plan: { key: string; name: string; price: number; yearlyPrice: number | null };
    scheduledPlan: { key: string; name: string } | null;
    scheduledInterval: string | null;
    status: string;
    billingInterval: string;
    periodStart: string;
    periodEnd: string;
    trialEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    pastDueSince: string | null;
    stripeBilled: boolean;
    createdAt: string;
    flags: { meteredPaused: boolean; suspended: boolean };
  };
  history: { id: string; actorType: string; changeType: string; before: unknown; after: unknown; reason: string | null; createdAt: string }[];
  invoices: {
    available: boolean;
    invoices: {
      id: string;
      number: string | null;
      status: string | null;
      amountDue: number;
      amountPaid: number;
      currency: string;
      createdAt: string;
      hostedInvoiceUrl: string | null;
      invoicePdf: string | null;
    }[];
  };
}

export interface TenantLimits {
  entitlements: EntitlementSet;
  meters: { metricCode: string; displayName: string; unit: string; kind: string; enforced: boolean; overridable: boolean }[];
  overrides: {
    id: string;
    metricCode: string;
    includedQuantity: number;
    effectiveFrom: string;
    expiresAt: string | null;
    reason: string;
    createdBy: string;
    createdAt: string;
    revokedAt: string | null;
    revokedBy: string | null;
    state: string;
  }[];
}

export interface TenantModules {
  plan: string;
  modules: { key: string; label: string; group: string; description: string; state: string; platform: ModuleBlock | null }[];
  history: { id: string; moduleKey: string; state: string; reason: string; expiresAt: string | null; createdAt: string; revokedAt: string | null; createdBy: string; revokedBy: string | null }[];
}

export interface AiLedger extends Paged<{ id: string; operationCode: string; band: string; reservedQty: number; actualQty: number | null; state: string; reason: string | null; reservedAt: string; settledAt: string | null }> {
  allocations: { id: string; operationCode: string | null; quantity: number; occurredAt: string; metadata: Record<string, unknown> | null }[];
}

export interface UserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  business: { id: string; name: string; parentId: string | null } | null;
  tenantId: string | null;
  role: string | null;
  memberships: number;
  membershipActive: boolean | null;
  platformStatus: string;
  locked: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  mfa: boolean;
}

export interface UserDetail {
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    createdAt: string;
    emailVerifiedAt: string | null;
    twoFactorEnabled: boolean;
    googleLinked: boolean;
    platformStatus: string;
    platformStatusReason: string | null;
    platformStatusAt: string | null;
    failedLoginAttempts: number;
    lockedUntil: string | null;
    businessUsers: {
      id: string;
      role: string;
      active: boolean;
      createdAt: string;
      customRole: { name: string } | null;
      business: { id: string; name: string; parentId: string | null; platformStatus: string };
    }[];
  };
  sessions: (SessionRow & { businessId: string; revokedAt: string | null })[];
  security: SecurityEventRow[];
  activity: { id: string; type: string; description: string; createdAt: string; businessId: string }[];
  changes: { id: string; action: string; entity: string; entityId: string; createdAt: string; businessId: string }[];
}

export interface PlanEntitlement {
  metricCode: string;
  kind: string;
  includedQuantity: number | null;
  resetRule: string;
}

export interface PlanRow {
  id: string;
  key: string;
  name: string;
  price: number;
  yearlyPrice: number | null;
  trialDays: number;
  displayOrder: number;
  purchasable: boolean;
  status: string;
  stripeLinked: boolean;
  stripePriceId: string | null;
  stripeYearlyPriceId: string | null;
  entitlements: PlanEntitlement[];
  subscribers: Record<string, number>;
  updatedAt: string;
}

export interface MeterDef {
  metricCode: string;
  displayName: string;
  unit: string;
  kind: string;
  enforced: boolean;
  resetRule: string;
}

export interface PlansResponse {
  plans: PlanRow[];
  meters: MeterDef[];
}

export interface SubscriptionRow {
  id: string;
  business: { id: string; name: string; currency?: string };
  plan: { key: string; name: string };
  scheduledPlan: { key: string; name: string } | null;
  billingInterval: string;
  amountUsd: number | null;
  status: string;
  periodStart: string;
  periodEnd: string;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  pastDueSince: string | null;
  stripeBilled: boolean;
  createdAt: string;
}

export interface ModuleRegistry {
  totalBusinesses: number;
  alwaysOn: { key: string; label: string }[];
  modules: {
    key: string;
    label: string;
    group: string;
    description: string;
    globallyDisabled: boolean;
    globalReason: string | null;
    updatedAt: string | null;
    turnedOffByOwners: number;
    suspendedFor: number;
    restrictedFor: number;
  }[];
}

export interface UsageOverview {
  range: { from: string | null; to: string | null };
  metrics: { metricCode: string; displayName: string; unit: string; kind: string; quantity: number; events: number; failed: number; costUsd: number; priceUsd: number }[];
  live: { users: number; locations: number };
  top: { businessId: string; name: string; quantity: number }[];
}

export interface UsageRecord {
  id: string;
  business: { id: string; name: string };
  user: { id: string; name: string } | null;
  metricCode: string;
  operationCode: string | null;
  quantity: number;
  unit: string;
  costUsd: number | null;
  priceUsd: number | null;
  provider: string | null;
  providerRef: string | null;
  countryCode: string | null;
  status: string;
  occurredAt: string;
  recordedAt: string;
}

export interface AiOverview {
  range: { from: string | null; to: string | null };
  currentPeriod: { businesses: number; allocated: number; consumed: number; reserved: number; remaining: number };
  inRange: { creditsConsumed: number; requests: number; failedOrReleased: number };
  averageResponseMs: number | null;
  byOperation: { operationCode: string; module: string; credits: number; requests: number }[];
  byBusiness: { businessId: string; name: string; credits: number }[];
  byProvider: { provider: string | null; credits: number; events: number }[];
}

export interface AiBalanceRow {
  businessId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  included: number;
  includedUsed: number;
  purchasedRemaining: number;
  purchasedUsed: number;
  reserved: number;
}

export interface ChannelUsage {
  metricCode: string;
  messages: Record<string, number>;
  categories: Record<string, number>;
  metered: { quantity: number; costUsd: number; priceUsd: number; marginUsd: number; failed: number };
  byCountry: { countryCode: string | null; quantity: number; costUsd: number; priceUsd: number }[];
  topBusinesses: { businessId: string; name: string; quantity: number; costUsd: number; priceUsd: number }[];
  campaignEvents?: Record<string, number>;
  connectedAccounts?: number;
}

export interface CommunicationsOverview {
  range: { from: string | null; to: string | null };
  spendCaps: { businesses: number; totalCapUsd: number };
  channels: Partial<Record<"whatsapp" | "sms" | "email", ChannelUsage>>;
}

export interface SecurityOverview {
  range: { from: string | null; to: string | null };
  trackingSince: string | null;
  logins: { successful: number; failed: number; newDevice: number; lockouts: number; blockedSuspended: number };
  admin: { failed: number; lockouts: number; activeSessions: number };
  permissionDenied: number;
  rateLimited: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  activeSessions: number;
  lockedAccounts: number;
  suspendedUsers: number;
  mfa: { enabled: number; total: number };
  recentAlerts: SecurityEventRow[];
  recentAdminChanges: AuditRow[];
  notDetected: string[];
}

export interface IntegrationsPage extends Paged<{
  id: string;
  business: { id: string; name: string };
  provider: string;
  status: string;
  connectedAt: string | null;
  lastSyncAt: string | null;
  pausedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: { at: string; message: string | null; recordsFailed: number } | null;
}> {
  summary: { provider: string; status: string; count: number }[];
}

export interface AdminRow {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  status: string;
  mfaEnrolled: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
  activeSessions: number;
}

export interface RolesResponse {
  permissions: { key: string; label: string }[];
  roles: { key: string; name: string; description: string | null; isSystem: boolean; locked: boolean; permissions: string[]; admins: number }[];
}

export interface AuditRow {
  id: string;
  adminId: string | null;
  adminEmail: string;
  businessId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  reason: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}
