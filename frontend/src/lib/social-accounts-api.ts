import { apiFetch } from "@/lib/api-client";

export const SOCIAL_PLATFORMS = [
  "facebook",
  "instagram",
  "twitter",
  "linkedin",
  "tiktok",
  "youtube",
  "pinterest",
  "snapchat",
  "threads",
  "reddit",
  "tumblr",
  "telegram",
  "discord",
  "wechat",
  "line",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "X (Twitter)",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  threads: "Threads",
  reddit: "Reddit",
  tumblr: "Tumblr",
  telegram: "Telegram",
  discord: "Discord",
  wechat: "WeChat",
  line: "LINE",
};

/** telegram/discord/wechat/line are token-based (no OAuth redirect) — connect() returns `requiresToken: true` for these. */
export const TOKEN_BASED_PLATFORMS: SocialPlatform[] = [
  "telegram",
  "discord",
  "wechat",
  "line",
];

export type SocialAccountStatus = "not_connected" | "connected" | "needs_attention";

export interface SocialAccountRow {
  platform: SocialPlatform;
  status: SocialAccountStatus;
  externalAccountName: string | null;
  updatedAt: string | null;
}

/** GET /social/accounts */
export function fetchSocialAccounts(): Promise<SocialAccountRow[]> {
  return apiFetch<SocialAccountRow[]>("/social/accounts");
}

export interface SocialConnectResult {
  authUrl?: string;
  requiresToken?: true;
}

/** POST /social/:platform/connect */
export function connectSocialAccount(platform: SocialPlatform): Promise<SocialConnectResult> {
  return apiFetch<SocialConnectResult>(`/social/${platform}/connect`, { method: "POST" });
}

/** POST /social/:platform/connect-with-token */
export function connectSocialAccountWithToken(platform: SocialPlatform, token: string): Promise<{ connected: true }> {
  return apiFetch<{ connected: true }>(`/social/${platform}/connect-with-token`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

/** POST /social/:platform/disconnect */
export function disconnectSocialAccount(platform: SocialPlatform): Promise<void> {
  return apiFetch<void>(`/social/${platform}/disconnect`, { method: "POST" });
}
