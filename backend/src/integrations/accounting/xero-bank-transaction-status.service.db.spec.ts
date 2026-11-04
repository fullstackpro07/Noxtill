import { ClsService } from 'nestjs-cls';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';
import { AppException } from '../../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { XeroBankTransactionStatusService } from './xero-bank-transaction-status.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('XeroBankTransactionStatusService (MySQL)', () => {
  let prisma: PrismaService;
  let service: XeroBankTransactionStatusService;
  let cls: FakeClsService;
  let businessId: string;
  const getFreshTokens = jest.fn();
  const getAuthorizedBankTransactionsPage = jest.fn();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new XeroBankTransactionStatusService(
      tenant,
      { getFreshTokens } as never,
      { getAuthorizedBankTransactionsPage } as never,
      cls as unknown as ClsService,
    );
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Xero Bank Status Test',
          slug: `xero-bank-status-${Date.now()}`,
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

  beforeEach(async () => {
    getFreshTokens.mockReset().mockResolvedValue({ accessToken: 'test-token' });
    getAuthorizedBankTransactionsPage.mockReset();
    await prisma.integration.deleteMany({ where: { businessId } });
  });

  it('reports Not connected without requesting provider tokens', async () => {
    const result = await service.summarize(businessId);

    expect(result.status).toBe('not_connected');
    expect(result.currencies).toEqual([]);
    expect(result.unavailableReason).toContain('bank transaction read access');
    expect(getFreshTokens).not.toHaveBeenCalled();
  });

  it('aggregates real provider flags by currency without mixing unlike amounts', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.xero,
        status: IntegrationStatus.connected,
        tokens: 'encrypted-test-token',
        meta: { tenantId: 'xero-tenant-test' },
      },
    });
    getAuthorizedBankTransactionsPage.mockResolvedValue([
      {
        status: 'AUTHORISED',
        type: 'RECEIVE',
        total: '100.25',
        currencyCode: 'USD',
        isReconciled: true,
      },
      {
        status: 'AUTHORISED',
        type: 'SPEND',
        total: '40.10',
        currencyCode: 'USD',
        isReconciled: false,
      },
      {
        status: 'AUTHORISED',
        type: 'SPEND',
        total: '12.50',
        currencyCode: 'EUR',
        isReconciled: false,
      },
      {
        status: 'DELETED',
        type: 'SPEND',
        total: '999.00',
        currencyCode: 'USD',
        isReconciled: false,
      },
    ]);

    const result = await service.summarize(businessId);

    expect(result).toMatchObject({
      status: 'available',
      source: 'Xero Accounting API BankTransactions',
      partial: false,
      currencies: [
        {
          currencyCode: 'EUR',
          reconciled: { transactionCount: 0, amount: '0.00' },
          unreconciled: { transactionCount: 1, amount: '12.50' },
        },
        {
          currencyCode: 'USD',
          reconciled: { transactionCount: 1, amount: '100.25' },
          unreconciled: { transactionCount: 1, amount: '40.10' },
        },
      ],
    });
    expect(result.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.toDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(getAuthorizedBankTransactionsPage).toHaveBeenCalledWith(
      { accessToken: 'test-token' },
      'xero-tenant-test',
      1,
      result.fromDate,
      result.toDate,
    );
    expect(JSON.stringify(result)).not.toContain('xero-tenant-test');
  });

  it('returns a typed provider-unavailable error instead of partial totals', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.xero,
        status: IntegrationStatus.connected,
        tokens: 'encrypted-test-token',
        meta: { tenantId: 'xero-tenant-test' },
      },
    });
    getAuthorizedBankTransactionsPage.mockRejectedValue(
      new Error('provider details must not escape'),
    );

    const result = service.summarize(businessId);
    await expect(result).rejects.toBeInstanceOf(AppException);
    await expect(result).rejects.toMatchObject({
      response: {
        code: 'XERO_BANK_TRANSACTION_STATUS_UNAVAILABLE',
      },
    });
  });

  it('refuses to read a different business than the active tenant', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, 'another-business');

    const result = await service.summarize(businessId);

    expect(result.status).toBe('unavailable');
    expect(result.unavailableReason).toContain('active business');
    expect(getFreshTokens).not.toHaveBeenCalled();
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });
});
