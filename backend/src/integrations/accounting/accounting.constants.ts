import { IntegrationProvider } from '@prisma/client';

/** Every `IntegrationProvider` that is an accounting platform (UPD-BE-072) — single source of truth. */
export const ACCOUNTING_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.quickbooks,
  IntegrationProvider.xero,
];

export const ACCOUNTING_ERROR_CODES = {
  UNKNOWN_PROVIDER: 'ACCOUNTING_UNKNOWN_PROVIDER',
  NO_PROVIDER_CONNECTED: 'ACCOUNTING_NO_PROVIDER_CONNECTED',
  NO_MAPPING: 'ACCOUNTING_NO_MAPPING',
} as const;

/** Orders pushed per `sync()` call — bounded so one business's backlog can't monopolize the run. */
export const ACCOUNTING_SYNC_BATCH_SIZE = 50;
