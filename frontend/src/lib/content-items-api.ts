import { apiFetch } from "@/lib/api-client";

export const CONTENT_ITEM_TYPES = ["social_post", "story", "reel", "email", "sms", "whatsapp", "article"] as const;
export type ContentItemType = (typeof CONTENT_ITEM_TYPES)[number];

export const CONTENT_ITEM_TYPE_LABELS: Record<ContentItemType, string> = {
  social_post: "Social Post",
  story: "Story",
  reel: "Reel",
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  article: "Article",
};

export const CONTENT_ITEM_CHANNELS = ["instagram", "facebook", "email", "whatsapp", "sms"] as const;
export type ContentItemChannel = (typeof CONTENT_ITEM_CHANNELS)[number];

export const CONTENT_ITEM_CHANNEL_LABELS: Record<ContentItemChannel, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

export const CONTENT_ITEM_STATUSES = ["draft", "needs_approval", "scheduled", "published", "failed"] as const;
export type ContentItemStatus = (typeof CONTENT_ITEM_STATUSES)[number];

export const CONTENT_ITEM_STATUS_LABELS: Record<ContentItemStatus, string> = {
  draft: "Draft",
  needs_approval: "Needs approval",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
};

export interface ContentItem {
  id: string;
  title: string;
  type: ContentItemType;
  channel: ContentItemChannel;
  body: string;
  scheduledFor: string | null;
  status: ContentItemStatus;
  ownerUserId: string | null;
  ownerUser: { user: { name: string } } | null;
  aiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContentItemInput {
  title: string;
  type: ContentItemType;
  channel: ContentItemChannel;
  body: string;
  scheduledFor?: string;
  ownerUserId?: string;
  aiGenerated?: boolean;
}

export type UpdateContentItemInput = Partial<Omit<CreateContentItemInput, "aiGenerated">> & { status?: ContentItemStatus };

export function fetchContentItems(): Promise<ContentItem[]> {
  return apiFetch<ContentItem[]>("/content-items");
}

export function createContentItem(input: CreateContentItemInput): Promise<ContentItem> {
  return apiFetch<ContentItem>("/content-items", { method: "POST", body: JSON.stringify(input) });
}

export function updateContentItem(id: string, input: UpdateContentItemInput): Promise<ContentItem> {
  return apiFetch<ContentItem>(`/content-items/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteContentItem(id: string): Promise<void> {
  return apiFetch(`/content-items/${id}`, { method: "DELETE" });
}

/** Real evidence-grounded ideas (best-selling products, most recent 5-star review) — never generic tips. */
export function fetchContentIdeas(): Promise<{ ideas: string[] }> {
  return apiFetch<{ ideas: string[] }>("/content-items/ideas");
}
