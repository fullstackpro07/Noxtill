import { apiFetch } from "./api-client";

export const CUSTOMER_PORTAL_FEATURES = [
  "orders",
  "bookings",
  "billing",
  "returns",
  "support",
  "loyalty",
  "account",
] as const;

export type CustomerPortalFeature = (typeof CUSTOMER_PORTAL_FEATURES)[number];
export type CustomerPortalCard = Exclude<CustomerPortalFeature, "account">;

export interface CustomerPortalCursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CustomerPortalPageInfo {
  nextCursor: string | null;
  hasMore: boolean;
}

export type CustomerPortalCursorParams = Record<string, string | undefined>;

function portalPageQuery(cursors: CustomerPortalCursorParams = {}) {
  const query = new URLSearchParams({ limit: "20" });
  for (const [key, cursor] of Object.entries(cursors)) {
    if (cursor) query.set(key, cursor);
  }
  return query.toString();
}

export const CUSTOMER_PORTAL_HOME_CARDS: CustomerPortalCard[] = [
  "orders",
  "bookings",
  "billing",
  "returns",
  "loyalty",
  "support",
];

export interface CustomerPortalLayout {
  cards: CustomerPortalCard[];
  labels: { card: CustomerPortalCard; label: string }[];
  announcements: { title: string; body: string; enabled: boolean }[];
  quickActions: { label: string; destination: CustomerPortalCard }[];
  visibilityRules: { card: CustomerPortalCard; customerTags: string[] }[];
}

export interface CustomerPortalSettings {
  enabled: boolean;
  enabledFeatures: CustomerPortalFeature[];
  inviteExpiryHours: number;
  termsUrl: string | null;
  privacyUrl: string | null;
}

export interface CustomerPortalSettingsView extends CustomerPortalSettings {
  businessName: string;
  businessSlug: string;
  locale: string;
  branding: {
    brandColor: string | null;
    colorSource: string;
    logoUrl: string | null;
    logoSource: string;
  };
  publicUrl: string;
  customDomain: string;
  authentication: {
    method: string;
    customerMfa: string;
    contactVerification: string;
    sessionDays: number;
  };
}

interface PortalAdminHeaders {
  method?: string;
  body?: unknown;
}

function adminRequest<T>(path: string, init: PortalAdminHeaders = {}) {
  const method = init.method ?? "GET";
  return apiFetch<T>(`/customer-portal${path}`, {
    method,
    ...(method !== "GET"
      ? { headers: { "Idempotency-Key": crypto.randomUUID() } }
      : {}),
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

function customerRequest<T>(
  path: string,
  token?: string,
  init: PortalAdminHeaders = {},
) {
  const method = init.method ?? "GET";
  return apiFetch<T>(
    `/customer-portal${path}`,
    {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(method !== "GET" ? { "Idempotency-Key": crypto.randomUUID() } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    },
    { skipAuth: true },
  );
}

export function fetchCustomerPortalOverview() {
  return adminRequest<{
    business: { id: string; name: string; slug: string; branding: unknown };
    settings: CustomerPortalSettings;
    activeAccounts: number;
    activeCustomers30Days: number;
    signInsLast7Days: number;
    failedSignInsLast7Days: number;
    selfServiceActionsLast7Days: number;
    currentlyLockedAccounts: number;
    pendingInvites: number;
    publishedLayout: { version: number; publishedAt: string | null } | null;
    recentActivity: {
      id: string;
      event: string;
      entityType: string | null;
      createdAt: string;
      customer: { name: string };
    }[];
    customerPortalEventsLast7Days: number;
    unsupported: Record<string, string>;
  }>("/overview");
}

export function fetchCustomerPortalSettings() {
  return adminRequest<CustomerPortalSettingsView>("/settings");
}

export function updateCustomerPortalSettings(settings: CustomerPortalSettings) {
  return adminRequest<CustomerPortalSettings>("/settings", {
    method: "PATCH",
    body: {
      enabled: settings.enabled,
      enabledFeatures: settings.enabledFeatures,
      inviteExpiryHours: settings.inviteExpiryHours,
      termsUrl: settings.termsUrl,
      privacyUrl: settings.privacyUrl,
    },
  });
}

export function fetchCustomerPortalAccounts() {
  return adminRequest<{
    accounts: {
      id: string;
      active: boolean;
      lastSignedInAt: string | null;
      createdAt: string;
      customer: {
        id: string;
        name: string;
        email: string | null;
        phone: string;
        status: string;
      };
      sessions: {
        id: string;
        createdAt: string;
        lastUsedAt: string;
        expiresAt: string;
      }[];
    }[];
    pendingInvites: {
      id: string;
      customerId: string;
      expiresAt: string;
      createdAt: string;
      customer: { name: string; email: string | null };
    }[];
    inviteCandidates: {
      id: string;
      name: string;
      email: string | null;
      phone: string;
      tags: unknown;
    }[];
  }>("/accounts");
}

export function createCustomerPortalInvite(customerId: string) {
  return adminRequest<{
    id: string;
    expiresAt: string;
    invitePath: string;
    delivery: string;
  }>(`/accounts/${encodeURIComponent(customerId)}/invite`, {
    method: "POST",
    body: {},
  });
}

export function revokeCustomerPortalInvite(inviteId: string) {
  return adminRequest<{ revoked: boolean }>(
    `/invites/${encodeURIComponent(inviteId)}/revoke`,
    { method: "POST", body: {} },
  );
}

export function setCustomerPortalAccountActive(
  accountId: string,
  active: boolean,
) {
  return adminRequest<{ id: string; active: boolean }>(
    `/accounts/${encodeURIComponent(accountId)}/active`,
    { method: "PATCH", body: { active } },
  );
}

export function fetchCustomerPortalLayouts() {
  return adminRequest<
    {
      id: string;
      version: number;
      layout: CustomerPortalLayout;
      status: string;
      publishedAt: string | null;
      createdAt: string;
    }[]
  >("/layout/versions");
}

export function saveCustomerPortalLayout(layout: CustomerPortalLayout) {
  return adminRequest<{
    id: string;
    version: number;
    layout: CustomerPortalLayout;
    status: string;
    createdAt: string;
  }>("/layout/draft", { method: "POST", body: layout });
}

export function publishCustomerPortalLayout(version: number) {
  return adminRequest<{ id: string; version: number; status: string }>(
    `/layout/${version}/publish`,
    { method: "POST", body: {} },
  );
}

export function restoreCustomerPortalLayout(version: number) {
  return adminRequest<{
    id: string;
    version: number;
    layout: CustomerPortalLayout;
    status: string;
    createdAt: string;
  }>(`/layout/${version}/restore`, { method: "POST", body: {} });
}

export function fetchPortalBootstrap(slug: string) {
  return customerRequest<{
    business: { name: string; slug: string; currency: string; locale: string };
    brandColor: string | null;
    logoUrl: string | null;
    enabledFeatures: CustomerPortalFeature[];
    termsUrl: string | null;
    privacyUrl: string | null;
  }>(`/business/${encodeURIComponent(slug)}`);
}

export function portalLogin(slug: string, email: string, password: string) {
  return customerRequest<{
    accessToken: string;
    tokenType: "Bearer";
    expiresAt: string;
  }>(`/business/${encodeURIComponent(slug)}/login`, undefined, {
    method: "POST",
    body: { email, password },
  });
}

export function portalAcceptInvite(
  slug: string,
  token: string,
  password: string,
) {
  return customerRequest<{
    accessToken: string;
    tokenType: "Bearer";
    expiresAt: string;
  }>(`/business/${encodeURIComponent(slug)}/accept-invite`, undefined, {
    method: "POST",
    body: { token, password },
  });
}

export function portalRequestPasswordReset(slug: string, email: string) {
  return customerRequest<{ message: string }>(
    `/business/${encodeURIComponent(slug)}/password-reset`,
    undefined,
    { method: "POST", body: { email } },
  );
}

export function portalResetPassword(slug: string, token: string, password: string) {
  return customerRequest<{ passwordReset: boolean }>(
    `/business/${encodeURIComponent(slug)}/reset-password`,
    undefined,
    { method: "POST", body: { token, password } },
  );
}

export function portalLogout(token: string) {
  return customerRequest<{ signedOut: boolean }>("/logout", token, {
    method: "POST",
    body: {},
  });
}

export function fetchPortalMe(token: string) {
  return customerRequest<{
    identity: {
      businessId: string;
      businessSlug: string;
      businessName: string;
      customerId: string;
      customerName: string;
      accountId: string;
      enabledFeatures: CustomerPortalFeature[];
      currency: string;
      locale: string;
    };
    customer: {
      id: string;
      name: string;
      email: string | null;
      phone: string;
      address: string | null;
      birthday: string | null;
      consentMarketing: boolean;
      createdAt: string;
    };
    dataRequests: {
      id: string;
      status: string;
      createdAt: string;
      fulfilledAt: string | null;
      resultUrl: string | null;
    }[];
  }>("/me", token);
}

export function updatePortalProfile(
  token: string,
  profile: { name: string; address: string; consentMarketing: boolean },
) {
  return customerRequest("/me/profile", token, {
    method: "PATCH",
    body: profile,
  });
}

export function requestPortalDataExport(token: string) {
  return customerRequest<{
    id: string;
    status: string;
    createdAt: string;
    reusedOpenRequest: boolean;
  }>("/me/data-export", token, { method: "POST", body: {} });
}

export function fetchPortalHome(token: string) {
  return customerRequest<{
    businessName: string;
    customerName: string;
    orders: {
      id: string;
      orderNo: number;
      status: string;
      total: string;
      createdAt: string;
    }[];
    upcomingAppointments: {
      id: string;
      startsAt: string;
      endsAt: string;
      status: string;
      service: { name: string };
    }[];
    enabledFeatures: CustomerPortalFeature[];
    layout: CustomerPortalLayout;
    support: { available: boolean; reason: string };
    billing: { onlinePayment: boolean; reason: string };
    legal: { termsUrl: string | null; privacyUrl: string | null };
  }>("/me/home", token);
}

export function fetchPortalOrders(token: string, cursor?: string) {
  const query = portalPageQuery({ cursor });
  return customerRequest<
    CustomerPortalCursorPage<{
      id: string;
      orderNo: number;
      orderType: string;
      status: string;
      paymentStatus: "paid" | "unpaid" | "partial" | "refunded";
      subtotal: string;
      tax: string;
      discount: string;
      total: string;
      createdAt: string;
      isQuotation: boolean;
      quotationStatus: string | null;
      quotationValidUntil: string | null;
      items: { id: string; name: string; price: string; qty: number }[];
      payments: {
        id: string;
        method: string;
        amount: string;
        createdAt: string;
      }[];
      delivery: {
        status: string;
        promisedAt: string | null;
        deliveredAt: string | null;
        trackingToken: string | null;
      } | null;
    }>
  >(`/me/orders?${query}`, token);
}

export function createPortalReorderDraft(token: string, orderId: string) {
  return customerRequest<{
    id: string;
    orderNo: number;
    status: string;
    total: string;
  }>(`/me/orders/${encodeURIComponent(orderId)}/reorder`, token, {
    method: "POST",
    body: {},
  });
}

export function fetchPortalBookings(
  token: string,
  cursors: CustomerPortalCursorParams = {},
) {
  return customerRequest<{
    appointments: {
      id: string;
      startsAt: string;
      endsAt: string;
      status: string;
      depositPaid: string;
      service: { name: string };
    }[];
    waitlist: {
      id: string;
      status: string;
      preferredFrom: string | null;
      preferredTo: string | null;
      offeredStartsAt: string | null;
      offeredEndsAt: string | null;
      service: { name: string };
    }[];
    queue: {
      id: string;
      number: number;
      status: string;
      calledAt: string | null;
      servedAt: string | null;
      createdAt: string;
      service: { name: string } | null;
    }[];
    pagination: Record<
      "appointments" | "waitlist" | "queue",
      CustomerPortalPageInfo
    >;
  }>(`/me/bookings?${portalPageQuery(cursors)}`, token);
}

export function fetchPortalBookingServices(token: string) {
  return customerRequest<
    { id: string; name: string; durationMin: number | null; price: string }[]
  >("/me/bookings/services", token);
}

export function fetchPortalBookingSlots(
  token: string,
  serviceId: string,
  date: string,
) {
  const query = new URLSearchParams({ service: serviceId, date });
  return customerRequest<{ slots: string[] }>(
    `/me/bookings/slots?${query.toString()}`,
    token,
  );
}

export function createPortalBooking(
  token: string,
  body: { serviceId: string; startsAt: string },
) {
  return customerRequest<{
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
  }>("/me/bookings", token, { method: "POST", body });
}

export function joinPortalWaitlist(token: string, serviceId: string) {
  return customerRequest<{ id: string; status: string }>(
    "/me/bookings/waitlist",
    token,
    { method: "POST", body: { serviceId } },
  );
}

export function joinPortalQueue(token: string, serviceId?: string) {
  return customerRequest<{ id: string; number: number; status: string }>(
    "/me/bookings/queue",
    token,
    { method: "POST", body: serviceId ? { serviceId } : {} },
  );
}

export function cancelPortalBooking(token: string, appointmentId: string) {
  return customerRequest(
    `/me/bookings/${encodeURIComponent(appointmentId)}/cancel`,
    token,
    { method: "POST", body: {} },
  );
}

export function reschedulePortalBooking(
  token: string,
  appointmentId: string,
  startsAt: string,
) {
  return customerRequest(
    `/me/bookings/${encodeURIComponent(appointmentId)}/reschedule`,
    token,
    { method: "POST", body: { startsAt } },
  );
}

export function downloadPortalReceipt(token: string, orderId: string) {
  return customerRequest<{ url: string }>(
    `/me/orders/${encodeURIComponent(orderId)}/receipt`,
    token,
    { method: "POST", body: {} },
  );
}

export function fetchPortalBilling(
  token: string,
  cursors: CustomerPortalCursorParams = {},
) {
  return customerRequest<{
    quotes: {
      id: string;
      orderNo: number;
      status: string;
      total: string;
      createdAt: string;
      paymentStatus: string;
      amountPaid: number;
      amountDue: number | null;
      quotationStatus: string | null;
      quotationValidUntil: string | null;
      items: { name: string; qty: number; price: string }[];
      payments: {
        id: string;
        amount: string;
        method: string;
        createdAt: string;
      }[];
    }[];
    ordersAndReceipts: {
      id: string;
      orderNo: number;
      status: string;
      total: string;
      createdAt: string;
      paymentStatus: string;
      amountPaid: number;
      amountDue: number | null;
      items: { name: string; qty: number; price: string }[];
      payments: {
        id: string;
        amount: string;
        method: string;
        createdAt: string;
      }[];
    }[];
    pagination: Record<"quotes" | "ordersAndReceipts", CustomerPortalPageInfo>;
    onlineInvoicePayment: { available: boolean; reason: string };
    note: string;
  }>(`/me/billing?${portalPageQuery(cursors)}`, token);
}

export function respondPortalQuote(
  token: string,
  quoteId: string,
  body: { response: "accept" | "decline"; reason?: string },
) {
  return customerRequest<{
    id: string;
    orderNo: number;
    quotationStatus: string;
  }>(`/me/billing/quotes/${encodeURIComponent(quoteId)}/respond`, token, {
    method: "POST",
    body,
  });
}

export function fetchPortalReturns(
  token: string,
  cursors: CustomerPortalCursorParams = {},
) {
  return customerRequest<{
    returns: {
      id: string;
      reason: string;
      refundMethod: string;
      refundAmount: string;
      status: string;
      createdAt: string;
      order: { orderNo: number };
      items: { productId: string; qty: number; amount: string }[];
    }[];
    eligibleOrders: {
      id: string;
      orderNo: number;
      createdAt: string;
      items: {
        productId: string | null;
        name: string;
        qty: number;
        price: string;
      }[];
    }[];
    pagination: Record<"returns" | "eligibleOrders", CustomerPortalPageInfo>;
    warranty: { tracked: boolean; reason: string };
    decision: string;
  }>(`/me/returns?${portalPageQuery(cursors)}`, token);
}

export function requestPortalReturn(
  token: string,
  body: {
    orderId: string;
    reason: string;
    refundMethod: string;
    restock?: boolean;
    items: { productId: string; qty: number }[];
  },
) {
  return customerRequest("/me/returns", token, { method: "POST", body });
}

export function fetchPortalSupport(token: string) {
  return customerRequest<{ available: boolean; reason: string }>(
    "/me/support",
    token,
  );
}

export function fetchPortalLoyalty(
  token: string,
  cursors: CustomerPortalCursorParams = {},
) {
  return customerRequest<{
    loyalty: {
      id: string;
      stampCount: number;
      redeemedCount: number;
      currentTier: string | null;
      program: {
        name: string;
        type: string;
        stampsRequired: number;
        rewardDescription: string | null;
        tiers: unknown;
        active: boolean;
      };
      stamps: { redeemed: boolean; createdAt: string }[];
    }[];
    memberships: {
      id: string;
      status: string;
      method: string;
      currentPeriodEnd: string | null;
      createdAt: string;
      plan: {
        name: string;
        price: string;
        interval: string;
        benefits: string | null;
      };
    }[];
    subscriptions: {
      id: string;
      status: string;
      nextRenewalAt: string;
      createdAt: string;
      plan: {
        name: string;
        interval: string;
        qtyPerCycle: number;
        pricePerUnit: string | null;
        allowSkip: boolean;
        product: { name: string; sellingPrice: string };
      };
      skipNextCycle: boolean;
    }[];
    preorders: {
      id: string;
      qty: number;
      status: string;
      promisedDate: string;
      createdAt: string;
      campaign: { name: string; product: { name: string } };
    }[];
    pagination: Record<
      "loyalty" | "memberships" | "subscriptions" | "preorders",
      CustomerPortalPageInfo
    >;
  }>(`/me/loyalty?${portalPageQuery(cursors)}`, token);
}

export function redeemPortalLoyaltyReward(token: string, memberId: string) {
  return customerRequest<{
    id: string;
    stampCount: number;
    redeemedCount: number;
  }>(`/me/loyalty/members/${encodeURIComponent(memberId)}/redeem`, token, {
    method: "POST",
    body: {},
  });
}

export function updatePortalCommerceSubscription(
  token: string,
  subscriptionId: string,
  action: "pause" | "resume" | "cancel" | "skip_next" | "keep_next",
  reason?: string,
) {
  return customerRequest<{
    id: string;
    status: string;
    skipNextCycle: boolean;
    nextRenewalAt: string;
  }>(
    `/me/loyalty/subscriptions/${encodeURIComponent(subscriptionId)}/action`,
    token,
    { method: "POST", body: { action, reason } },
  );
}

export function cancelPortalMembership(
  token: string,
  membershipId: string,
  reason: string,
) {
  return customerRequest<{ id: string; status: string }>(
    `/me/loyalty/memberships/${encodeURIComponent(membershipId)}/cancel`,
    token,
    { method: "POST", body: { reason } },
  );
}

export function fetchPortalActivity(token: string) {
  return customerRequest<
    {
      id: string;
      event: string;
      entityType: string | null;
      entityId: string | null;
      createdAt: string;
    }[]
  >("/me/activity", token);
}
