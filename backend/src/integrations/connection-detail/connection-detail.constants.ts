export const CONNECTION_DETAIL_ERROR_CODES = {
  UNKNOWN_PROVIDER: 'CONNECTION_DETAIL_UNKNOWN_PROVIDER',
  SYNC_NOT_SUPPORTED: 'CONNECTION_DETAIL_SYNC_NOT_SUPPORTED',
} as const;

export type ConnectionCategory =
  'ads' | 'directory' | 'accounting' | 'ecommerce' | 'automation' | 'other';
