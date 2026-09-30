import { apiFetch } from "@/lib/api-client";

export type CommerceListingDraftStatus =
  "draft" | "review_required" | "approved";
export type CommerceListingChannel =
  | "shopify"
  | "woocommerce"
  | "amazon"
  | "ebay"
  | "etsy"
  | "tiktok_shop"
  | "google_merchant"
  | "other";

export interface ListingSourcedText {
  text: string;
  sourceIds: string[];
}

export interface ListingContent {
  title: ListingSourcedText;
  bullets: ListingSourcedText[];
  description: ListingSourcedText;
  faq: Array<{ question: string; answer: ListingSourcedText }>;
  seo: {
    metaTitle: ListingSourcedText;
    metaDescription: ListingSourcedText;
    keywords: ListingSourcedText[];
  };
}

export interface ListingSource {
  id: string;
  label: string;
  value: string;
  origin: "canonical_product" | "merchant_evidence";
  reference?: string;
}

export interface CommerceListingDraft {
  id: string;
  productId: string;
  product: {
    id: string;
    name: string;
    category: string | null;
    sellingPrice: number;
    active: boolean;
  };
  channel: string;
  market: string | null;
  language: string;
  brandVoice: string | null;
  status: CommerceListingDraftStatus;
  currentVersion: number;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  latestVersion: {
    version: number;
    content: ListingContent;
    sources: ListingSource[];
    generationMethod: string;
    createdByUserId: string | null;
    approvedByUserId: string | null;
    approvedAt: string | null;
    approvalReason: string | null;
    createdAt: string;
  } | null;
  publishStatus: "approval_required" | "channel_sync_available";
  note: string;
}

export interface CommerceListingDraftHistory {
  versions: Array<{
    id: string;
    version: number;
    content: ListingContent;
    sources: ListingSource[];
    generationMethod: string;
    changeReason: string | null;
    createdByUserId: string | null;
    approvedByUserId: string | null;
    approvedAt: string | null;
    approvalReason: string | null;
    createdAt: string;
  }>;
  audits: Array<{
    id: string;
    action: string;
    reason: string | null;
    actorUserId: string | null;
    createdAt: string;
  }>;
}

export interface ListingMerchantEvidence {
  statement: string;
  reference: string;
}

export interface CommerceChannelListing {
  id: string;
  draftId: string;
  product: {
    id: string;
    name: string;
    sku: string | null;
    sellingPrice: number;
  };
  channel: string;
  provider: "shopify" | "woocommerce";
  market: string | null;
  draftStatus: CommerceListingDraftStatus;
  externalProductId: string | null;
  syncedVersion: number | null;
  currentVersion: number;
  outOfDate: boolean;
  sellingPriceAtSync: number | null;
  priceOutOfDate: boolean;
  status: "pending" | "synced" | "failed";
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommerceChannelListingSyncResult {
  id: string;
  draftId: string;
  provider: "shopify" | "woocommerce";
  externalProductId: string | null;
  status: "synced";
  syncedVersion: number | null;
  currentVersion: number;
  sellingPriceAtSync: number;
  lastSyncedAt: string;
  outOfDate: boolean;
}

export function fetchCommerceChannelListings(): Promise<
  CommerceChannelListing[]
> {
  return apiFetch<CommerceChannelListing[]>(
    "/commerce/listing-builder/channel-listings",
  );
}

export function syncCommerceListingDraft(
  id: string,
  provider: "shopify" | "woocommerce",
): Promise<CommerceChannelListingSyncResult> {
  return apiFetch<CommerceChannelListingSyncResult>(
    `/commerce/listing-builder/${id}/sync/${provider}`,
    { method: "POST" },
  );
}

export function fetchCommerceListingDrafts(
  filters: {
    search?: string;
    status?: CommerceListingDraftStatus;
  } = {},
): Promise<CommerceListingDraft[]> {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.status) params.set("status", filters.status);
  const query = params.size ? `?${params.toString()}` : "";
  return apiFetch<CommerceListingDraft[]>(`/commerce/listing-builder${query}`);
}

export function generateCommerceListingDraft(input: {
  productId: string;
  channel: CommerceListingChannel;
  market?: string;
  language?: string;
  brandVoice?: string;
  merchantEvidence?: ListingMerchantEvidence[];
}): Promise<CommerceListingDraft> {
  return apiFetch<CommerceListingDraft>("/commerce/listing-builder", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function regenerateCommerceListingDraft(
  id: string,
  input: {
    expectedVersion: number;
    reason?: string;
    merchantEvidence?: ListingMerchantEvidence[];
  },
): Promise<CommerceListingDraft> {
  return apiFetch<CommerceListingDraft>(
    `/commerce/listing-builder/${id}/regenerate`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function editCommerceListingDraft(
  id: string,
  input: {
    expectedVersion: number;
    content: ListingContent;
    reason: string;
  },
): Promise<CommerceListingDraft> {
  return apiFetch<CommerceListingDraft>(`/commerce/listing-builder/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function approveCommerceListingDraft(
  id: string,
  input: {
    expectedVersion: number;
    confirmedSourceAccuracy: boolean;
    reason: string;
  },
): Promise<CommerceListingDraft> {
  return apiFetch<CommerceListingDraft>(
    `/commerce/listing-builder/${id}/approve`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function fetchCommerceListingDraftHistory(
  id: string,
): Promise<CommerceListingDraftHistory> {
  return apiFetch<CommerceListingDraftHistory>(
    `/commerce/listing-builder/${id}/history`,
  );
}
