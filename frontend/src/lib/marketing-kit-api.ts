import { apiFetch } from "@/lib/api-client";

export const MARKETING_ASSET_FORMATS = [
  "a5_poster",
  "a4_poster",
  "ig_story",
  "table_tent",
  "window_sticker",
  "vehicle_decal",
] as const;
export type MarketingAssetFormat = (typeof MARKETING_ASSET_FORMATS)[number];

export const MARKETING_ASSET_FORMAT_LABELS: Record<MarketingAssetFormat, string> = {
  a5_poster: "A5 Poster",
  a4_poster: "A4 Poster",
  ig_story: "Instagram Story",
  table_tent: "Table Tent",
  window_sticker: "Window Sticker",
  vehicle_decal: "Vehicle Decal",
};

export const MARKETING_ASSET_TEMPLATES = ["classic", "bold", "minimal"] as const;
export type MarketingAssetTemplate = (typeof MARKETING_ASSET_TEMPLATES)[number];

export const MARKETING_ASSET_CONTENT_BLOCKS = ["logo", "business_name", "tagline", "phone", "top_products", "qr_code"] as const;
export type MarketingAssetContentBlock = (typeof MARKETING_ASSET_CONTENT_BLOCKS)[number];

export const MARKETING_ASSET_CONTENT_BLOCK_LABELS: Record<MarketingAssetContentBlock, string> = {
  logo: "Your logo",
  business_name: "Business name",
  tagline: "Custom tagline",
  phone: "Phone number",
  top_products: "Top products",
  qr_code: "WhatsApp QR code",
};

export interface GenerateMarketingKitInput {
  format: MarketingAssetFormat;
  template: MarketingAssetTemplate;
  contentBlocks: MarketingAssetContentBlock[];
  tagline?: string;
  fileType?: "png" | "pdf";
  backgroundKey?: string;
}

export function uploadMarketingKitBackground(file: File): Promise<{ backgroundKey: string; backgroundUrl: string }> {
  const formData = new FormData();
  formData.append("background", file);
  return apiFetch<{ backgroundKey: string; backgroundUrl: string }>("/marketing/kit/background", {
    method: "POST",
    body: formData,
  });
}

export function generateMarketingKit(input: GenerateMarketingKitInput): Promise<{ url: string }> {
  return apiFetch<{ url: string }>("/marketing/kit", { method: "POST", body: JSON.stringify(input) });
}
