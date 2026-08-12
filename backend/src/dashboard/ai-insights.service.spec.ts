import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AiInfraService } from '../ai/ai-infra.service';
import { AiInsightsService } from './ai-insights.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AiInsightsService (UPD-BE-003)', () => {
  let prisma: PrismaService;
  let service: AiInsightsService;
  let businessId: string;
  const aiInfra = { complete: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new AiInsightsService(
      tenantPrisma,
      aiInfra as unknown as AiInfraService,
    );

    const business = await prisma.business.create({
      data: { name: 'Insights Test Biz', slug: `insights-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    aiInfra.complete.mockReset();
  });

  afterAll(async () => {
    await prisma.aiInsight.deleteMany({ where: { businessId } });
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.orderItem.deleteMany({
      where: { order: { businessId } },
    });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.campaign.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  describe('gatherFacts()', () => {
    it('returns no facts for a brand-new business with no data', async () => {
      const facts = await service.gatherFacts(businessId);
      // No sales/stock/credit yet; customers/marketing facts also need real signal to fire.
      expect(facts.find((f) => f.category === 'sales')).toBeUndefined();
      expect(facts.find((f) => f.category === 'stock')).toBeUndefined();
      expect(facts.find((f) => f.category === 'credit')).toBeUndefined();
    });

    it('flags stock as notable from a real low-stock product', async () => {
      await prisma.product.create({
        data: {
          businessId,
          kind: 'product',
          name: 'Low Widget',
          costPrice: 5,
          sellingPrice: 10,
          stockQty: 2,
          lowStockThreshold: 5,
          active: true,
        },
      });

      const facts = await service.gatherFacts(businessId);
      const stockFact = facts.find((f) => f.category === 'stock');
      expect(stockFact).toBeDefined();
      expect(stockFact?.sourceFigure).toContain('Low Widget (2 left)');
    });

    it('flags credit as notable once a real debtor is 30+ days overdue', async () => {
      const customer = await prisma.customer.create({
        data: { businessId, name: 'Overdue Customer', phone: '+10000000010' },
      });
      const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: customer.id,
          kind: 'credit',
          amount: 200,
          createdAt: oldDate,
        },
      });

      const facts = await service.gatherFacts(businessId);
      const creditFact = facts.find((f) => f.category === 'credit');
      expect(creditFact).toBeDefined();
      expect(creditFact?.sourceFigure).toContain('Overdue Customer owes 200');
    });

    it('flags marketing as quiet when a business has customers but no recent campaign', async () => {
      const facts = await service.gatherFacts(businessId);
      const marketingFact = facts.find((f) => f.category === 'marketing');
      expect(marketingFact).toBeDefined();
      expect(marketingFact?.sourceFigure).toContain('No campaign sent');
    });

    it('does not flag marketing once a recent campaign exists', async () => {
      await prisma.campaign.create({
        data: {
          businessId,
          segment: 'all',
          templateKey: 'promo',
          body: 'Hello',
        },
      });

      const facts = await service.gatherFacts(businessId);
      expect(facts.find((f) => f.category === 'marketing')).toBeUndefined();
    });
  });

  describe('generateForBusiness()', () => {
    it('writes real AiInsight rows using the AI-phrased observation when the AI call succeeds', async () => {
      aiInfra.complete.mockImplementation((_biz: string, prompt: string) => {
        const factCount = (prompt.match(/^\d+\. \[/gm) || []).length;
        return Promise.resolve(
          JSON.stringify(
            Array.from(
              { length: factCount },
              (_, i) => `AI sentence ${i + 1}.`,
            ),
          ),
        );
      });

      const count = await service.generateForBusiness(businessId);
      expect(count).toBeGreaterThan(0);

      const rows = await prisma.aiInsight.findMany({ where: { businessId } });
      expect(rows).toHaveLength(count);
      expect(rows.every((r) => r.observation.startsWith('AI sentence'))).toBe(
        true,
      );
      expect(rows.every((r) => r.status === 'new')).toBe(true);
      // The source figure always comes from real data, never from the AI response.
      expect(rows.some((r) => r.sourceFigure.includes('Low Widget'))).toBe(
        true,
      );
    });

    it('falls back to the raw source figure as the observation when the AI call fails', async () => {
      await prisma.aiInsight.deleteMany({ where: { businessId } });
      aiInfra.complete.mockRejectedValue(
        new Error('ANTHROPIC_API_KEY is not configured'),
      );

      const count = await service.generateForBusiness(businessId);
      expect(count).toBeGreaterThan(0);

      const rows = await prisma.aiInsight.findMany({ where: { businessId } });
      expect(rows.every((r) => r.observation === r.sourceFigure)).toBe(true);
    });

    it('falls back gracefully when the AI response is not valid JSON', async () => {
      await prisma.aiInsight.deleteMany({ where: { businessId } });
      aiInfra.complete.mockResolvedValue('this is not json at all');

      const count = await service.generateForBusiness(businessId);
      expect(count).toBeGreaterThan(0);

      const rows = await prisma.aiInsight.findMany({ where: { businessId } });
      expect(rows.every((r) => r.observation === r.sourceFigure)).toBe(true);
    });
  });

  describe('list() and setStatus()', () => {
    it('lists real insights filtered by category and status', async () => {
      const all = await service.list(businessId);
      expect(all.length).toBeGreaterThan(0);

      const stockOnly = await service.list(businessId, 'stock');
      expect(stockOnly.every((r) => r.category === 'stock')).toBe(true);

      const newOnly = await service.list(businessId, undefined, 'new');
      expect(newOnly.every((r) => r.status === 'new')).toBe(true);
    });

    it('updates a real insight to actioned or dismissed', async () => {
      const [insight] = await service.list(businessId);
      const updated = await service.setStatus(
        businessId,
        insight.id,
        'actioned',
      );
      expect(updated.status).toBe('actioned');

      const dismissed = await service.setStatus(
        businessId,
        insight.id,
        'dismissed',
      );
      expect(dismissed.status).toBe('dismissed');
    });

    it('rejects an insight id that belongs to a different business', async () => {
      const other = await prisma.business.create({
        data: { name: 'Other Biz', slug: `other-biz-${Date.now()}` },
      });
      const foreignInsight = await prisma.aiInsight.create({
        data: {
          businessId: other.id,
          category: 'sales',
          observation: 'x',
          sourceFigure: 'x',
        },
      });

      await expect(
        service.setStatus(businessId, foreignInsight.id, 'actioned'),
      ).rejects.toThrow();

      await prisma.aiInsight.delete({ where: { id: foreignInsight.id } });
      await prisma.business.delete({ where: { id: other.id } });
    });
  });
});
