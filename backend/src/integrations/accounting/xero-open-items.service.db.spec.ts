import { ClsService } from 'nestjs-cls';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { XeroOpenItemsService } from './xero-open-items.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

function dateOffset(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('XeroOpenItemsService (MySQL)', () => {
  let prisma: PrismaService;
  let service: XeroOpenItemsService;
  let cls: FakeClsService;
  let businessId: string;
  const getFreshTokens = jest.fn();
  const getAuthorizedOpenInvoicesPage = jest.fn();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new XeroOpenItemsService(
      tenant,
      { getFreshTokens } as never,
      { getAuthorizedOpenInvoicesPage } as never,
      cls as unknown as ClsService,
    );
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Xero Open Items Test',
          slug: `xero-open-items-${Date.now()}`,
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.integration.deleteMany({ where: { businessId } });
      await prisma.business.deleteMany({ where: { id: businessId } });
    }
    await prisma.$disconnect();
  });

  beforeEach(() => {
    getFreshTokens.mockReset().mockResolvedValue({ accessToken: 'token' });
    getAuthorizedOpenInvoicesPage.mockReset();
  });

  it('discloses when the current business has not connected Xero', async () => {
    await prisma.integration.deleteMany({ where: { businessId } });

    const result = await service.summarize(businessId);

    expect(result.status).toBe('not_connected');
    expect(result.currencies).toEqual([]);
    expect(result.unavailableReason).toContain('Connect Xero');
    expect(getFreshTokens).not.toHaveBeenCalled();
  });

  it('groups authorized open invoices and bills by their real currency and due-date age', async () => {
    await prisma.integration.upsert({
      where: {
        businessId_provider: {
          businessId,
          provider: IntegrationProvider.xero,
        },
      },
      create: {
        businessId,
        provider: IntegrationProvider.xero,
        status: IntegrationStatus.connected,
        tokens: 'encrypted-test-token',
        meta: { tenantId: 'xero-tenant-test' },
      },
      update: {
        status: IntegrationStatus.connected,
        tokens: 'encrypted-test-token',
        meta: { tenantId: 'xero-tenant-test' },
      },
    });
    getAuthorizedOpenInvoicesPage.mockImplementation(
      (_tokens, _tenantId, type: string, page: number) => {
        if (page > 1) return [];
        if (type === 'ACCREC') {
          return [
            {
              type: 'ACCREC',
              status: 'AUTHORISED',
              amountDue: '100.25',
              currencyCode: 'USD',
              dueDateString: dateOffset(-45),
            },
            {
              type: 'ACCREC',
              status: 'AUTHORISED',
              amountDue: '50.00',
              currencyCode: 'EUR',
              dueDateString: dateOffset(10),
            },
            {
              type: 'ACCREC',
              status: 'PAID',
              amountDue: '900.00',
              currencyCode: 'USD',
              dueDateString: dateOffset(-90),
            },
            {
              type: 'ACCREC',
              status: 'AUTHORISED',
              amountDue: '12.00',
              currencyCode: 'USD',
              dueDateString: undefined,
            },
            {
              type: 'ACCREC',
              status: 'AUTHORISED',
              amountDue: '5.00',
              currencyCode: 'USD',
              dueDateString: dateOffset(0),
            },
            {
              type: 'ACCREC',
              status: 'AUTHORISED',
              amountDue: '7.00',
              currencyCode: 'USD',
              dueDateString: dateOffset(40),
            },
          ];
        }
        return [
          {
            type: 'ACCPAY',
            status: 'AUTHORISED',
            amountDue: '20.00',
            currencyCode: 'USD',
            dueDateString: dateOffset(-95),
          },
        ];
      },
    );

    const result = await service.summarize(businessId);

    expect(result.status).toBe('available');
    expect(result.partial).toBe(false);
    expect(result.currencies).toHaveLength(2);
    const usd = result.currencies.find(
      (currency) => currency.currencyCode === 'USD',
    );
    const eur = result.currencies.find(
      (currency) => currency.currencyCode === 'EUR',
    );
    expect(usd?.receivables).toMatchObject({
      invoiceCount: 4,
      amountDue: '124.25',
    });
    expect(
      usd?.receivables.buckets.find((bucket) => bucket.key === '31_60'),
    ).toMatchObject({ invoiceCount: 1, amountDue: '100.25' });
    expect(
      usd?.receivables.buckets.find(
        (bucket) => bucket.key === 'missing_due_date',
      ),
    ).toMatchObject({ invoiceCount: 1, amountDue: '12.00' });
    expect(
      usd?.receivables.upcomingDue.find(
        (bucket) => bucket.key === 'due_today',
      ),
    ).toMatchObject({ invoiceCount: 1, amountDue: '5.00' });
    expect(
      usd?.receivables.upcomingDue.find(
        (bucket) => bucket.key === 'due_after_30_days',
      ),
    ).toMatchObject({ invoiceCount: 1, amountDue: '7.00' });
    expect(usd?.payables).toMatchObject({
      invoiceCount: 1,
      amountDue: '20.00',
    });
    expect(
      usd?.payables.buckets.find((bucket) => bucket.key === 'over_90'),
    ).toMatchObject({ invoiceCount: 1, amountDue: '20.00' });
    expect(eur?.receivables).toMatchObject({
      invoiceCount: 1,
      amountDue: '50.00',
    });
    expect(
      eur?.receivables.upcomingDue.find(
        (bucket) => bucket.key === 'due_in_8_30_days',
      ),
    ).toMatchObject({ invoiceCount: 1, amountDue: '50.00' });
    expect(getAuthorizedOpenInvoicesPage).toHaveBeenCalledWith(
      { accessToken: 'token' },
      'xero-tenant-test',
      'ACCREC',
      1,
    );
  });

  it('refuses to combine another branch organization into the active business', async () => {
    const otherBusiness = await prisma.business.create({
      data: {
        name: 'Xero Other Branch Test',
        slug: `xero-other-branch-${Date.now()}`,
        parentId: businessId,
      },
    });
    try {
      cls.set(CLS_KEY_BUSINESS_ID, otherBusiness.id);
      const result = await service.summarize(businessId);
      expect(result.status).toBe('unavailable');
      expect(result.unavailableReason).toContain('active business');
      expect(getAuthorizedOpenInvoicesPage).not.toHaveBeenCalled();
    } finally {
      cls.set(CLS_KEY_BUSINESS_ID, businessId);
      await prisma.integration.deleteMany({
        where: { businessId: otherBusiness.id },
      });
      await prisma.business.delete({ where: { id: otherBusiness.id } });
    }
  });
});
