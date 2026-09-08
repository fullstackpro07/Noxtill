export const LISTING_ERROR_CODES = {
  MASTER_LISTING_NOT_SET: 'MASTER_LISTING_NOT_SET',
  GMB_POST_NOT_FOUND: 'GMB_POST_NOT_FOUND',
  GMB_PHOTO_NOT_FOUND: 'GMB_PHOTO_NOT_FOUND',
  GMB_QNA_NOT_FOUND: 'GMB_QNA_NOT_FOUND',
  GMB_NOT_CONNECTED: 'GMB_NOT_CONNECTED',
  LISTING_PHOTO_NOT_FOUND: 'LISTING_PHOTO_NOT_FOUND',
} as const;

export const GMB_INSIGHTS_QUEUE = 'gmb-insights-pull';

/** Photos & Media, cross-directory (UPD-BE-124) — matches the real `ListingPhotoCategory` Prisma enum. */
export const LISTING_PHOTO_CATEGORIES = [
  'exterior',
  'interior',
  'team',
  'products',
  'logo',
] as const;

/** Listings Settings (UPD-BE-125). `directory_wins` is stored/real but not yet functionally wired — see `ListingSettings`'s schema doc comment. */
export const CONFLICT_RESOLUTIONS = ['master_wins', 'directory_wins'] as const;

export const LISTINGS_AUTO_SYNC_QUEUE = 'listings-auto-sync';
