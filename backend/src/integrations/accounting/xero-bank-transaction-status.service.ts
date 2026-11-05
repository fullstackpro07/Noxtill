import { HttpStatus, Injectable } from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus, Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AppException } from '../../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { IntegrationsService } from '../integrations.service';
import { OAuthTokens } from '../connector.interface';
import {
  XeroBankTransactionSummary,
  XeroConnector,
} from '../connectors/xero.connector';

const XERO_TENANT_ID_KEY = 'tenantId';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const DAY_MS = 86_400_000;

type MutableTotals = {
  transactionCount: number;
  amount: Prisma.Decimal;
};

type CurrencyTotals = {
  currencyCode: string;
  reconciled: MutableTotals;
  unreconciled: MutableTotals;
};

export type XeroBankTransactionStatusReview = {
  status: 'available' | 'not_connected' | 'unavailable';
  source: 'Xero Accounting API BankTransactions' | null;
  observedAt: string | null;
  fromDate: string | null;
  toDate: string | null;
  partial: boolean;
  currencies: Array<{
    currencyCode: string;
    reconciled: { transactionCount: number; amount: string };
    unreconciled: { transactionCount: number; amount: string };
  }>;
  unavailableReason: string | null;
};

function emptyTotals(): MutableTotals {
  return { transactionCount: 0, amount: new Prisma.Decimal(0) };
}

function emptyReview(
  status: XeroBankTransactionStatusReview['status'],
  unavailableReason: string,
): XeroBankTransactionStatusReview {
  return {
    status,
    source: null,
    observedAt: null,
    fromDate: null,
    toDate: null,
    partial: false,
    currencies: [],
    unavailableReason,
  };
}

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function validateTransaction(
  transaction: XeroBankTransactionSummary,
): { currencyCode: string; amount: Prisma.Decimal; isReconciled: boolean } {
  if (transaction.status !== 'AUTHORISED') {
    throw new Error('Xero returned an unauthorized bank transaction.');
  }
  if (typeof transaction.isReconciled !== 'boolean') {
    throw new Error('Xero returned an invalid reconciliation status.');
  }
  const currencyCode = transaction.currencyCode.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error('Xero returned an invalid bank transaction currency.');
  }
  const amount = new Prisma.Decimal(transaction.total);
  if (!amount.isFinite()) {
    throw new Error('Xero returned an invalid bank transaction amount.');
  }
  return { currencyCode, amount, isReconciled: transaction.isReconciled };
}

@Injectable()
export class XeroBankTransactionStatusService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    private readonly xero: XeroConnector,
    private readonly cls: ClsService,
  ) {}

  async summarize(businessId: string): Promise<XeroBankTransactionStatusReview> {
    if (this.cls.get<string>(CLS_KEY_BUSINESS_ID) !== businessId) {
      return emptyReview(
        'unavailable',
        'Xero transaction status is only read for the active business. Review one connected business at a time.',
      );
    }

    const integration = await this.tenantPrisma.client.integration.findUnique({
      where: {
        businessId_provider: {
          businessId,
          provider: IntegrationProvider.xero,
        },
      },
      select: { status: true, meta: true },
    });
    if (!integration || integration.status !== IntegrationStatus.connected) {
      return emptyReview(
        'not_connected',
        'Connect Xero with bank transaction read access to see its reconciliation flags.',
      );
    }

    const metadata = integration.meta;
    const tenantId =
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      typeof metadata[XERO_TENANT_ID_KEY] === 'string'
        ? metadata[XERO_TENANT_ID_KEY]
        : null;
    if (!tenantId) {
      return emptyReview(
        'unavailable',
        'The connected Xero organization is not available. Reconnect Xero in Integrations.',
      );
    }

    let tokens: OAuthTokens | null;
    try {
      tokens = await this.integrations.getFreshTokens(
        businessId,
        IntegrationProvider.xero,
      );
    } catch {
      return emptyReview(
        'unavailable',
        'Xero authorization needs attention. Reconnect Xero in Integrations, then run the check again.',
      );
    }
    if (!tokens) {
      return emptyReview(
        'unavailable',
        'Xero has no usable authorization. Reconnect it in Integrations.',
      );
    }

    const now = new Date();
    const toDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const fromDate = new Date(toDate.getTime() - 29 * DAY_MS);
    const fromDateText = utcDateString(fromDate);
    const toDateText = utcDateString(toDate);
    const byCurrency = new Map<string, CurrencyTotals>();
    let partial = false;

    try {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const rows = await this.xero.getAuthorizedBankTransactionsPage(
          tokens,
          tenantId,
          page,
          fromDateText,
          toDateText,
        );
        for (const row of rows) {
          if (row.status !== 'AUTHORISED') continue;
          const { currencyCode, amount, isReconciled } =
            validateTransaction(row);
          let totals = byCurrency.get(currencyCode);
          if (!totals) {
            totals = {
              currencyCode,
              reconciled: emptyTotals(),
              unreconciled: emptyTotals(),
            };
            byCurrency.set(currencyCode, totals);
          }
          const side = isReconciled ? totals.reconciled : totals.unreconciled;
          side.transactionCount += 1;
          side.amount = side.amount.plus(amount);
        }
        if (rows.length < PAGE_SIZE) break;
        if (page === MAX_PAGES) partial = true;
      }
    } catch {
      throw new AppException(
        'XERO_BANK_TRANSACTION_STATUS_UNAVAILABLE',
        'Xero bank transaction status could not be read. Reconnect with bank transaction read access or check the Xero connection in Integrations.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const freeze = (side: MutableTotals) => ({
      transactionCount: side.transactionCount,
      amount: side.amount.toFixed(2),
    });
    return {
      status: 'available',
      source: 'Xero Accounting API BankTransactions',
      observedAt: now.toISOString(),
      fromDate: fromDateText,
      toDate: toDateText,
      partial,
      currencies: [...byCurrency.values()]
        .sort((left, right) => left.currencyCode.localeCompare(right.currencyCode))
        .map((totals) => ({
          currencyCode: totals.currencyCode,
          reconciled: freeze(totals.reconciled),
          unreconciled: freeze(totals.unreconciled),
        })),
      unavailableReason: null,
    };
  }
}
