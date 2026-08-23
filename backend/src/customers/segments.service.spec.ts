import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import type { AiInfraService } from '../ai/ai-infra.service';
import { SegmentsService } from './segments.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SegmentsService (BE-041, extended by UPD-BE-098)', () => {
  let prisma: PrismaService;
  let segmentsService: SegmentsService;
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
    segmentsService = new SegmentsService(
      tenantPrisma,
      aiInfra as unknown as AiInfraService,
    );

    const business = await prisma.business.create({
      data: { name: 'Segments Test Biz', slug: `segments-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.customer.createMany({
      data: [
        {
          businessId,
          phone: '+10000000001',
          name: 'VIP Customer',
          tags: ['VIP'],
          lifetimeSpend: 900,
          visitCount: 12,
        },
        {
          businessId,
          phone: '+10000000002',
          name: 'Lapsed Customer',
          tags: ['Lapsed'],
          lifetimeSpend: 50,
          visitCount: 1,
        },
        {
          businessId,
          phone: '+10000000003',
          name: 'Regular Customer',
          tags: [],
          lifetimeSpend: 200,
          visitCount: 4,
        },
      ],
    });
  });

  afterEach(() => {
    aiInfra.complete.mockClear();
  });

  afterAll(async () => {
    await prisma.segment.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  describe('getSegment (legacy hardcoded keys, BE-041)', () => {
    it('returns VIP-tagged customers for the vip segment', async () => {
      const segment = await segmentsService.getSegment('vip');
      expect(segment.count).toBe(1);
      expect(segment.members[0].name).toBe('VIP Customer');
    });

    it('returns Lapsed-tagged customers for the lapsed segment', async () => {
      const segment = await segmentsService.getSegment('lapsed');
      expect(segment.count).toBe(1);
      expect(segment.members[0].name).toBe('Lapsed Customer');
    });

    it('returns all recently-created customers for the new segment', async () => {
      const segment = await segmentsService.getSegment('new');
      expect(segment.count).toBe(3);
    });

    it('treats any other key as a custom tag filter', async () => {
      const segment = await segmentsService.getSegment('VIP');
      expect(segment.count).toBe(1);
    });

    it('returns every customer for the all segment', async () => {
      const segment = await segmentsService.getSegment('all');
      expect(segment.count).toBe(3);
    });
  });

  describe('real persisted segments (UPD-BE-098)', () => {
    it('creates a segment and matches it via getSegment(id), same as a legacy key', async () => {
      const segment = await segmentsService.create(businessId, {
        name: 'Big spenders',
        rules: {
          combinator: 'AND',
          conditions: [{ field: 'lifetimeSpend', operator: 'gt', value: 100 }],
        },
      });

      const resolved = await segmentsService.getSegment(segment.id);
      expect(resolved.count).toBe(2);
      expect(resolved.members.map((m) => m.name).sort()).toEqual([
        'Regular Customer',
        'VIP Customer',
      ]);
    });

    it('AND-combines multiple conditions', async () => {
      const segment = await segmentsService.create(businessId, {
        name: 'Big AND frequent',
        rules: {
          combinator: 'AND',
          conditions: [
            { field: 'lifetimeSpend', operator: 'gt', value: 100 },
            { field: 'visitCount', operator: 'gte', value: 10 },
          ],
        },
      });
      const resolved = await segmentsService.getSegment(segment.id);
      expect(resolved.count).toBe(1);
      expect(resolved.members[0].name).toBe('VIP Customer');
    });

    it('OR-combines multiple conditions', async () => {
      const segment = await segmentsService.create(businessId, {
        name: 'VIP or Lapsed tag',
        rules: {
          combinator: 'OR',
          conditions: [
            { field: 'tags', operator: 'contains', value: 'VIP' },
            { field: 'tags', operator: 'contains', value: 'Lapsed' },
          ],
        },
      });
      const resolved = await segmentsService.getSegment(segment.id);
      expect(resolved.count).toBe(2);
    });

    it('list() includes a live matching count per segment', async () => {
      const segment = await segmentsService.create(businessId, {
        name: 'Everyone',
        rules: {
          combinator: 'AND',
          conditions: [{ field: 'lifetimeSpend', operator: 'gte', value: 0 }],
        },
      });
      const list = await segmentsService.list();
      const found = list.find((s) => s.id === segment.id);
      expect(found?.count).toBe(3);
    });

    it('previewCount() evaluates an unsaved rule set', async () => {
      const result = await segmentsService.previewCount({
        combinator: 'AND',
        conditions: [{ field: 'lifetimeSpend', operator: 'lt', value: 100 }],
      });
      expect(result.count).toBe(1);
    });

    it('update() changes the rules a segment matches on', async () => {
      const segment = await segmentsService.create(businessId, {
        name: 'Mutable',
        rules: {
          combinator: 'AND',
          conditions: [
            { field: 'lifetimeSpend', operator: 'gt', value: 10000 },
          ],
        },
      });
      expect((await segmentsService.getSegment(segment.id)).count).toBe(0);

      await segmentsService.update(segment.id, {
        rules: {
          combinator: 'AND',
          conditions: [{ field: 'lifetimeSpend', operator: 'gte', value: 0 }],
        },
      });
      expect((await segmentsService.getSegment(segment.id)).count).toBe(3);
    });

    it('duplicate() copies name and rules into a new segment', async () => {
      const original = await segmentsService.create(businessId, {
        name: 'Original',
        rules: {
          combinator: 'AND',
          conditions: [{ field: 'tags', operator: 'contains', value: 'VIP' }],
        },
      });
      const copy = await segmentsService.duplicate(businessId, original.id);
      expect(copy.id).not.toBe(original.id);
      expect(copy.name).toBe('Original (copy)');
      expect((await segmentsService.getSegment(copy.id)).count).toBe(1);
    });

    it('remove() deletes a segment', async () => {
      const segment = await segmentsService.create(businessId, {
        name: 'To delete',
        rules: {
          combinator: 'AND',
          conditions: [{ field: 'lifetimeSpend', operator: 'gte', value: 0 }],
        },
      });
      await segmentsService.remove(segment.id);
      await expect(
        segmentsService.update(segment.id, { name: 'x' }),
      ).rejects.toThrow();
    });
  });

  describe('suggestPersona (UPD-FE-082)', () => {
    it('parses a real JSON response from the model', async () => {
      aiInfra.complete.mockResolvedValue(
        '{"name": "Loyal Regulars", "description": "Customers who spend steadily and visit often."}',
      );
      const result = await segmentsService.suggestPersona(businessId, {
        combinator: 'AND',
        conditions: [{ field: 'visitCount', operator: 'gte', value: 5 }],
      });
      expect(result).toEqual({
        name: 'Loyal Regulars',
        description: 'Customers who spend steadily and visit often.',
      });
    });

    it('falls back to an honest label if the model response is not parseable JSON', async () => {
      aiInfra.complete.mockResolvedValue('not json at all');
      const result = await segmentsService.suggestPersona(businessId, {
        combinator: 'AND',
        conditions: [{ field: 'visitCount', operator: 'gte', value: 5 }],
      });
      expect(result.name).toBe('Custom segment');
      expect(result.description).toContain('visitCount gte 5');
    });
  });
});
