import { PrismaService } from '../prisma/prisma.service';
import { PublicCreditService } from './public-credit.service';
import { generateReviewToken } from '../reviews/review-token.util';

describe('PublicCreditService (UPD-BE-022)', () => {
  let prisma: PrismaService;
  let service: PublicCreditService;
  let businessId: string;
  let customerId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new PublicCreditService(prisma);

    const business = await prisma.business.create({
      data: {
        name: 'Public Credit Test Biz',
        slug: `public-credit-test-${Date.now()}`,
      },
    });
    businessId = business.id;

    const customer = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}`,
        name: 'Public Ledger Customer',
      },
    });
    customerId = customer.id;

    await prisma.creditEntry.create({
      data: {
        businessId,
        customerId,
        kind: 'credit',
        amount: 80,
        note: 'Sale',
      },
    });
    await prisma.creditEntry.create({
      data: {
        businessId,
        customerId,
        kind: 'payment',
        amount: 30,
        note: 'Paid some',
      },
    });
  });

  afterAll(async () => {
    await prisma.creditShareLink.deleteMany({ where: { businessId } });
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('resolves a real, non-revoked token to the correct real balance and business/customer names', async () => {
    const link = await prisma.creditShareLink.create({
      data: { businessId, customerId, token: generateReviewToken() },
    });

    const result = await service.getByToken(link.token);
    expect(result.businessName).toBe('Public Credit Test Biz');
    expect(result.customerName).toBe('Public Ledger Customer');
    expect(result.balance).toBe(50);
    expect(result.entries).toHaveLength(2);
  });

  it('404s on an unknown token', async () => {
    await expect(service.getByToken('not-a-real-token')).rejects.toThrow();
  });

  it('404s on a revoked token, never leaking the balance', async () => {
    const link = await prisma.creditShareLink.create({
      data: {
        businessId,
        customerId,
        token: generateReviewToken(),
        revoked: true,
      },
    });

    await expect(service.getByToken(link.token)).rejects.toThrow();
  });
});
