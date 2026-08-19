export const SEO_HEATMAP_DEFAULT_RADIUS_KM = 3;
/** Center point + this many points evenly spaced around it — 8 gives a real 9-point grid. */
export const SEO_HEATMAP_DEFAULT_RING_POINTS = 8;

export const SEO_HEATMAP_ERROR_CODES = {
  NO_ADDRESS: 'SEO_HEATMAP_NO_ADDRESS',
  GEOCODE_FAILED: 'SEO_HEATMAP_GEOCODE_FAILED',
  MAPS_PROVIDER_NOT_CONFIGURED: 'SEO_HEATMAP_MAPS_PROVIDER_NOT_CONFIGURED',
} as const;
