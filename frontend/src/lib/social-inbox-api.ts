import { apiFetch } from "@/lib/api-client";
import type { SocialPlatform } from "@/lib/social-accounts-api";

export type SocialInboxStatus = "unread" | "read" | "replied";
export type SocialInboxKind = "comment" | "dm" | "mention";

export interface SocialInboxItem {
  id: string;
  businessId: string;
  platform: SocialPlatform;
  externalId: string;
  kind: SocialInboxKind;
  authorName: string | null;
  text: string;
  postExternalId: string | null;
  status: SocialInboxStatus;
  repliedText: string | null;
  repliedAt: string | null;
  receivedAt: string;
  createdAt: string;
}

export function fetchSocialInbox(status?: SocialInboxStatus): Promise<SocialInboxItem[]> {
  const qs = status ? `?status=${status}` : "";
  return apiFetch<SocialInboxItem[]>(`/social/inbox${qs}`);
}

export function replySocialInboxItem(id: string, text: string): Promise<SocialInboxItem> {
  return apiFetch<SocialInboxItem>(`/social/inbox/${id}/reply`, { method: "POST", body: JSON.stringify({ text }) });
}

export function markSocialInboxItemRead(id: string): Promise<SocialInboxItem> {
  return apiFetch<SocialInboxItem>(`/social/inbox/${id}/read`, { method: "PATCH" });
}
