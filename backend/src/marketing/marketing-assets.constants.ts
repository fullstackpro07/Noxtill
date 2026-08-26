/** UPD-BE-105: format presets a marketing asset can be generated at. `ig_story` is pixel-native
 * (a phone-screen story), everything else is a real physical print size in mm. */
export const MARKETING_ASSET_FORMATS = [
  'a5_poster',
  'a4_poster',
  'ig_story',
  'table_tent',
  'window_sticker',
  'vehicle_decal',
] as const;
export type MarketingAssetFormat = (typeof MARKETING_ASSET_FORMATS)[number];

export const MARKETING_ASSET_TEMPLATES = [
  'classic',
  'bold',
  'minimal',
] as const;
export type MarketingAssetTemplate = (typeof MARKETING_ASSET_TEMPLATES)[number];

/** Every block is optional and pulled from real data — `top_products` is the business's own real
 * top-sellers (via `ProfitService.byProduct`), never a fabricated list. */
export const MARKETING_ASSET_CONTENT_BLOCKS = [
  'logo',
  'business_name',
  'tagline',
  'phone',
  'top_products',
  'qr_code',
] as const;
export type MarketingAssetContentBlock =
  (typeof MARKETING_ASSET_CONTENT_BLOCKS)[number];

interface MmDimensions {
  widthMm: number;
  heightMm: number;
}
interface PxDimensions {
  widthPx: number;
  heightPx: number;
}

export const MARKETING_ASSET_FORMAT_DIMENSIONS: Record<
  MarketingAssetFormat,
  MmDimensions | PxDimensions
> = {
  a5_poster: { widthMm: 148, heightMm: 210 },
  a4_poster: { widthMm: 210, heightMm: 297 },
  ig_story: { widthPx: 1080, heightPx: 1920 },
  table_tent: { widthMm: 100, heightMm: 150 },
  window_sticker: { widthMm: 150, heightMm: 150 },
  vehicle_decal: { widthMm: 300, heightMm: 200 },
};

export function isPxFormat(
  dims: MmDimensions | PxDimensions,
): dims is PxDimensions {
  return 'widthPx' in dims;
}

export const MAX_MARKETING_ASSET_BACKGROUND_SIZE_BYTES = 10 * 1024 * 1024;
