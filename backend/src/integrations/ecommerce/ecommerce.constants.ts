import { IntegrationProvider } from '@prisma/client';

/** Every `IntegrationProvider` that is an e-commerce platform (UPD-BE-073) — single source of truth. */
export const ECOMMERCE_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.shopify,
  IntegrationProvider.woocommerce,
];

/** Remote products/orders fetched per provider per `sync()` call — one real page, a disclosed simplification (no pagination loop yet). */
export const ECOMMERCE_FETCH_LIMIT = 100;

/**
 * Which system wins when Noxtill and the store hold different stock for the same SKU. Stored on
 * `Integration.meta.sourceOfTruth` per connection.
 *  - `noxtill` — Noxtill's stock is pushed to the store (default)
 *  - `store`   — the store's stock is applied in Noxtill
 *  - `manual`  — neither side is touched; the difference waits as a pending conflict
 */
export const SOURCE_OF_TRUTH_VALUES = ['noxtill', 'store', 'manual'] as const;
export type SourceOfTruth = (typeof SOURCE_OF_TRUTH_VALUES)[number];
export const SOURCE_OF_TRUTH_DEFAULT: SourceOfTruth = 'noxtill';

export function isSourceOfTruth(value: unknown): value is SourceOfTruth {
  return (SOURCE_OF_TRUTH_VALUES as readonly unknown[]).includes(value);
}

export const ECOMMERCE_ERROR_CODES = {
  NOT_CONNECTED: 'ECOMMERCE_NOT_CONNECTED',
  CONFLICT_NOT_FOUND: 'ECOMMERCE_CONFLICT_NOT_FOUND',
  CONFLICT_NOT_PENDING: 'ECOMMERCE_CONFLICT_NOT_PENDING',
  INVALID_QTY: 'ECOMMERCE_INVALID_QTY',
  PRODUCT_NOT_FOUND: 'ECOMMERCE_PRODUCT_NOT_FOUND',
  PUSH_FAILED: 'ECOMMERCE_PUSH_FAILED',
} as const;
