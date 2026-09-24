import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VoiceRoutingRulesService } from './voice-routing-rules.service';
import { AppException } from '../common/filters/app.exception';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceRoutingRulesService (AI Phone, full — Queue & Routing)', () => {
  let prisma: PrismaService;
  let service: VoiceRoutingRulesService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new VoiceRoutingRulesService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Routing Rules Test Biz',
        slug: `voice-routing-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.voiceRoutingRule.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('creates rules in order, auto-assigning position', async () => {
    const a = await service.create(businessId, {
      name: 'Complaint keyword',
      triggerKind: 'keyword',
      matchValue: 'refund',
      action: 'transfer',
    });
    const b = await service.create(businessId, {
      name: 'Low confidence',
      triggerKind: 'low_confidence',
      action: 'take_message',
    });
    expect(a.position).toBe(1);
    expect(b.position).toBe(2);

    const list = await service.list(businessId);
    expect(list.map((r) => r.name)).toEqual([
      'Complaint keyword',
      'Low confidence',
    ]);
  });

  it('rejects a keyword/topic/sentiment rule with no match value', async () => {
    await expect(
      service.create(businessId, {
        name: 'No value',
        triggerKind: 'keyword',
        action: 'transfer',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('updates and reorders real rows, refusing a reorder that drops or invents an id', async () => {
    const list = await service.list(businessId);
    const [first, second] = list;

    await service.update(businessId, first.id, { active: false });
    const updated = await service.list(businessId);
    expect(updated.find((r) => r.id === first.id)?.active).toBe(false);

    const reordered = await service.reorder(businessId, {
      ids: [second.id, first.id],
    });
    expect(reordered.map((r) => r.id)).toEqual([second.id, first.id]);
    expect(reordered.map((r) => r.position)).toEqual([1, 2]);

    await expect(
      service.reorder(businessId, { ids: [second.id] }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('deletes a rule for real', async () => {
    const rule = await service.create(businessId, {
      name: 'Temp',
      triggerKind: 'after_hours',
      action: 'take_message',
    });
    await service.remove(businessId, rule.id);
    const list = await service.list(businessId);
    expect(list.find((r) => r.id === rule.id)).toBeUndefined();
  });

  it('never returns or touches another business’s rules', async () => {
    const other = await prisma.business.create({
      data: { name: 'Other Biz', slug: `voice-routing-other-${Date.now()}` },
    });
    try {
      const otherRule = await prisma.voiceRoutingRule.create({
        data: {
          businessId: other.id,
          position: 1,
          name: 'Other rule',
          triggerKind: 'after_hours',
          action: 'take_message',
        },
      });
      await expect(
        service.update(businessId, otherRule.id, { active: false }),
      ).rejects.toThrow();
      await expect(service.remove(businessId, otherRule.id)).rejects.toThrow();
    } finally {
      await prisma.voiceRoutingRule.deleteMany({
        where: { businessId: other.id },
      });
      await prisma.business.delete({ where: { id: other.id } });
    }
  });

  it('enforces the rule-count limit', async () => {
    const existing = await service.list(businessId);
    const toAdd = 20 - existing.length;
    for (let i = 0; i < toAdd; i++) {
      await service.create(businessId, {
        name: `Filler ${i}`,
        triggerKind: 'after_hours',
        action: 'take_message',
      });
    }
    await expect(
      service.create(businessId, {
        name: 'One too many',
        triggerKind: 'after_hours',
        action: 'take_message',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });
});
