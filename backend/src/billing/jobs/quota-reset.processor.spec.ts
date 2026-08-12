import { PrismaService } from '../../prisma/prisma.service';
import { QuotaResetProcessor } from './quota-reset.processor';

describe('QuotaResetProcessor (INT-014)', () => {
  let prisma: PrismaService;
  let processor: QuotaResetProcessor;
  const now = new Date('2026-09-15T00:00:00Z');
  const previousMonthReset = new Date('2026-08-20T00:00:00Z');
  const sameMonthReset = new Date('2026-09-05T00:00:00Z');

  const businessIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new QuotaResetProcessor(prisma);
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    await prisma.$disconnect();
  });

  async function makeBusiness(data: {
    msgUsed: number;
    msgQuotaResetAt: Date | null;
  }) {
    const business = await prisma.business.create({
      data: {
        name: 'Quota Reset Test Biz',
        slug: `quota-reset-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        msgUsed: data.msgUsed,
        msgQuotaResetAt: data.msgQuotaResetAt,
      },
    });
    businessIds.push(business.id);
    return business;
  }

  it('resets a business that has never been reset (msgQuotaResetAt is null)', async () => {
    const business = await makeBusiness({ msgUsed: 50, msgQuotaResetAt: null });

    await processor.runReset(now);

    const refreshed = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(refreshed.msgUsed).toBe(0);
    expect(refreshed.msgQuotaResetAt).toEqual(now);
  });

  it('resets a business whose last reset was in an earlier UTC calendar month', async () => {
    const business = await makeBusiness({
      msgUsed: 80,
      msgQuotaResetAt: previousMonthReset,
    });

    await processor.runReset(now);

    const refreshed = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(refreshed.msgUsed).toBe(0);
    expect(refreshed.msgQuotaResetAt).toEqual(now);
  });

  it('leaves a business untouched if it was already reset this same UTC calendar month', async () => {
    const business = await makeBusiness({
      msgUsed: 30,
      msgQuotaResetAt: sameMonthReset,
    });

    await processor.runReset(now);

    const refreshed = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(refreshed.msgUsed).toBe(30);
    expect(refreshed.msgQuotaResetAt).toEqual(sameMonthReset);
  });
});
