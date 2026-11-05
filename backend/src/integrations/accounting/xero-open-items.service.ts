import { HttpStatus, Injectable } from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus, Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AppException } from '../../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { IntegrationsService } from '../integrations.service';
import { OAuthTokens } from '../connector.interface';
import {
  XeroConnector,
  XeroOpenInvoiceSummary,
  XeroOpenInvoiceType,
} from '../connectors/xero.connector';

const PAGE_SIZE = 100;
const MAX_PAGES_PER_TYPE = 20;
const XERO_TENANT_ID_KEY = 'tenantId';

const AGING_BUCKETS = [
  { key: 'current', label: 'Current / not overdue' },
  { key: '1_30', label: '1–30 days overdue' },
  { key: '31_60', label: '31–60 days overdue' },
  { key: '61_90', label: '61–90 days overdue' },
  { key: 'over_90', label: 'Over 90 days overdue' },
  { key: 'missing_due_date', label: 'Due date unavailable' },
] as const;

const UPCOMING_DUE_BUCKETS = [
  { key: 'due_today', label: 'Due today' },
  { key: 'due_in_1_7_days', label: 'Due in 1–7 days' },
  { key: 'due_in_8_30_days', label: 'Due in 8–30 days' },
  { key: 'due_after_30_days', label: 'Due after 30 days' },
] as const;

type AgingBucketKey = (typeof AGING_BUCKETS)[number]['key'];
type UpcomingDueBucketKey = (typeof UPCOMING_DUE_BUCKETS)[number]['key'];

type AgingBucket = {
  key: AgingBucketKey;
  label: string;
  invoiceCount: number;
  amountDue: string;
};

type OpenItemsSide = {
  invoiceCount: number;
  amountDue: string;
  buckets: AgingBucket[];
  upcomingDue: Array<{
    key: UpcomingDueBucketKey;
    label: string;
    invoiceCount: number;
    amountDue: string;
  }>;
};

export type XeroOpenItemsReview = {
  status: 'available' | 'not_connected' | 'unavailable';
  source: 'Xero Accounting API invoices' | null;
  observedAt: string | null;
  asOfDate: string | null;
  partial: boolean;
  currencies: Array<{
    currencyCode: string;
    receivables: OpenItemsSide;
    payables: OpenItemsSide;
  }>;
  unavailableReason: string | null;
};

type MutableBucket = { invoiceCount: number; amountDue: Prisma.Decimal };
type MutableSide = {
  invoiceCount: number;
  amountDue: Prisma.Decimal;
  buckets: Record<AgingBucketKey, MutableBucket>;
  upcomingDue: Record<UpcomingDueBucketKey, MutableBucket>;
};

function emptySide(): MutableSide {
  return {
    invoiceCount: 0,
    amountDue: new Prisma.Decimal(0),
    buckets: Object.fromEntries(
      AGING_BUCKETS.map(({ key }) => [
        key,
        { invoiceCount: 0, amountDue: new Prisma.Decimal(0) },
      ]),
    ) as Record<AgingBucketKey, MutableBucket>,
    upcomingDue: Object.fromEntries(
      UPCOMING_DUE_BUCKETS.map(({ key }) => [
        key,
        { invoiceCount: 0, amountDue: new Prisma.Decimal(0) },
      ]),
    ) as Record<UpcomingDueBucketKey, MutableBucket>,
  };
}

function utcDate(value: string | undefined): Date | null {
  if (!value) return null;
  const dateOnly = value.match(/^(\d{4}-\d{2}-\d{2})/);
  const epoch = value.match(/^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/);
  const date = dateOnly
    ? new Date(`${dateOnly[1]}T00:00:00.000Z`)
    : epoch
      ? new Date(Number(epoch[1]))
      : new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      );
}

function bucketFor(dueDate: Date | null, asOf: Date): AgingBucketKey {
  if (!dueDate) return 'missing_due_date';
  const overdueDays = Math.floor(
    (asOf.getTime() - dueDate.getTime()) / 86_400_000,
  );
  if (overdueDays <= 0) return 'current';
  if (overdueDays <= 30) return '1_30';
  if (overdueDays <= 60) return '31_60';
  if (overdueDays <= 90) return '61_90';
  return 'over_90';
}

function upcomingDueBucketFor(
  dueDate: Date | null,
  asOf: Date,
): UpcomingDueBucketKey | null {
  if (!dueDate) return null;
  const daysUntilDue = Math.floor(
    (dueDate.getTime() - asOf.getTime()) / 86_400_000,
  );
  if (daysUntilDue === 0) return 'due_today';
  if (daysUntilDue <= 7) return daysUntilDue > 0 ? 'due_in_1_7_days' : null;
  if (daysUntilDue <= 30) return 'due_in_8_30_days';
  return 'due_after_30_days';
}

function emptyReview(
  status: XeroOpenItemsReview['status'],
  unavailableReason: string,
): XeroOpenItemsReview {
  return {
    status,
    source: null,
    observedAt: null,
    asOfDate: null,
    partial: false,
    currencies: [],
    unavailableReason,
  };
}

@Injectable()
export class XeroOpenItemsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    private readonly xero: XeroConnector,
    private readonly cls: ClsService,
  ) {}

  async summarize(businessId: string): Promise<XeroOpenItemsReview> {
    if (this.cls.get<string>(CLS_KEY_BUSINESS_ID) !== businessId) {
      return emptyReview(
        'unavailable',
        'Xero open-item data is only read for the active business. Run this review from the selected branch to avoid mixing organization data.',
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
        'Connect Xero in Integrations to read authorized customer invoices and supplier bills.',
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
        'Xero authorization needs attention. Reconnect Xero in Integrations, then run the review again.',
      );
    }
    if (!tokens) {
      return emptyReview(
        'unavailable',
        'Xero has no usable authorization. Reconnect it in Integrations.',
      );
    }

    const asOf = new Date();
    const asOfUtc = new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
    );
    const currencies = new Map<
      string,
      Record<XeroOpenInvoiceType, MutableSide>
    >();
    let partial = false;

    try {
      for (const type of ['ACCREC', 'ACCPAY'] as const) {
        const invoices = await this.readAllPages(tokens, tenantId, type);
        partial ||= invoices.partial;
        for (const invoice of invoices.items) {
          if (invoice.type !== type || invoice.status !== 'AUTHORISED')
            continue;
          const amount = new Prisma.Decimal(invoice.amountDue);
          if (!amount.isFinite()) {
            throw new Error('Xero returned an invalid amount due.');
          }
          if (!amount.greaterThan(0)) continue;
          const currencyCode = invoice.currencyCode.toUpperCase();
          if (!/^[A-Z]{3}$/.test(currencyCode)) {
            throw new Error('Xero returned an invalid invoice currency.');
          }
          let currencySides = currencies.get(currencyCode);
          if (!currencySides) {
            currencySides = { ACCREC: emptySide(), ACCPAY: emptySide() };
            currencies.set(currencyCode, currencySides);
          }
          const side = currencySides[type];
          const dueDate = utcDate(invoice.dueDateString ?? invoice.dueDate);
          const key = bucketFor(dueDate, asOfUtc);
          side.invoiceCount += 1;
          side.amountDue = side.amountDue.plus(amount);
          side.buckets[key].invoiceCount += 1;
          side.buckets[key].amountDue =
            side.buckets[key].amountDue.plus(amount);
          const upcomingKey = upcomingDueBucketFor(dueDate, asOfUtc);
          if (upcomingKey) {
            side.upcomingDue[upcomingKey].invoiceCount += 1;
            side.upcomingDue[upcomingKey].amountDue = side.upcomingDue[
              upcomingKey
            ].amountDue.plus(amount);
          }
        }
      }
    } catch {
      throw new AppException(
        'XERO_OPEN_ITEMS_UNAVAILABLE',
        'Xero open invoices could not be read. Reconnect Xero with invoice read access or check the connection in Integrations.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      status: 'available',
      source: 'Xero Accounting API invoices',
      observedAt: asOf.toISOString(),
      asOfDate: asOfUtc.toISOString().slice(0, 10),
      partial,
      currencies: [...currencies.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currencyCode, currencySides]) => ({
          currencyCode,
          receivables: this.freezeSide(currencySides.ACCREC),
          payables: this.freezeSide(currencySides.ACCPAY),
        })),
      unavailableReason: null,
    };
  }

  private async readAllPages(
    tokens: OAuthTokens,
    tenantId: string,
    type: XeroOpenInvoiceType,
  ): Promise<{ items: XeroOpenInvoiceSummary[]; partial: boolean }> {
    const items: XeroOpenInvoiceSummary[] = [];
    for (let page = 1; page <= MAX_PAGES_PER_TYPE; page += 1) {
      const result = await this.xero.getAuthorizedOpenInvoicesPage(
        tokens,
        tenantId,
        type,
        page,
      );
      items.push(...result);
      if (result.length < PAGE_SIZE) return { items, partial: false };
      if (page === MAX_PAGES_PER_TYPE) return { items, partial: true };
    }
    return { items, partial: true };
  }

  private freezeSide(side: MutableSide): OpenItemsSide {
    return {
      invoiceCount: side.invoiceCount,
      amountDue: side.amountDue.toFixed(2),
      buckets: AGING_BUCKETS.map(({ key, label }) => ({
        key,
        label,
        invoiceCount: side.buckets[key].invoiceCount,
        amountDue: side.buckets[key].amountDue.toFixed(2),
      })),
      upcomingDue: UPCOMING_DUE_BUCKETS.map(({ key, label }) => ({
        key,
        label,
        invoiceCount: side.upcomingDue[key].invoiceCount,
        amountDue: side.upcomingDue[key].amountDue.toFixed(2),
      })),
    };
  }
}
