import { IntegrationProvider } from '@prisma/client';

/** Every `IntegrationProvider` that is an e-commerce platform (UPD-BE-073) — single source of truth. */
export const ECOMMERCE_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.shopify,
  IntegrationProvider.woocommerce,
];

/** Remote products/orders fetched per provider per `sync()` call — one real page, a disclosed simplification (no pagination loop yet). */
export const ECOMMERCE_FETCH_LIMIT = 100;
