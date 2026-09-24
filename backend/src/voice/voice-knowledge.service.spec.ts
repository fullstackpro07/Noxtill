import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VoiceKnowledgeService } from './voice-knowledge.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceKnowledgeService (AI Phone, full — Knowledge sources)', () => {
  let prisma: PrismaService;
  let service: VoiceKnowledgeService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new VoiceKnowledgeService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Voice Knowledge Test Biz',
        slug: `voice-knowledge-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.voiceKnowledgeEntry.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('creates an FAQ entry, keeping the question only for FAQs', async () => {
    const faq = await service.create(businessId, {
      kind: 'faq',
      title: 'Eid hours',
      question: 'Are you open on Eid?',
      content: 'We are closed on both days of Eid.',
    });
    expect(faq.question).toBe('Are you open on Eid?');

    const doc = await service.create(businessId, {
      kind: 'document',
      title: 'Returns policy',
      question: 'ignored for a document',
      content: 'Returns are accepted within 7 days with a receipt.',
    });
    expect(doc.question).toBeNull();
  });

  it('updates and deletes a real row', async () => {
    const entry = await service.create(businessId, {
      kind: 'faq',
      title: 'Parking',
      content: 'Free parking is available behind the building.',
    });
    const updated = await service.update(businessId, entry.id, {
      active: false,
    });
    expect(updated.active).toBe(false);

    await service.remove(businessId, entry.id);
    const list = await service.list();
    expect(list.find((e) => e.id === entry.id)).toBeUndefined();
  });

  it('never lets one business touch another’s entries', async () => {
    const other = await prisma.business.create({
      data: {
        name: 'Other Knowledge Biz',
        slug: `voice-knowledge-other-${Date.now()}`,
      },
    });
    try {
      const otherEntry = await prisma.voiceKnowledgeEntry.create({
        data: {
          businessId: other.id,
          kind: 'faq',
          title: 'Other',
          content: 'Other content',
        },
      });
      await expect(
        service.update(businessId, otherEntry.id, { active: false }),
      ).rejects.toThrow();
      await expect(service.remove(businessId, otherEntry.id)).rejects.toThrow();
    } finally {
      await prisma.voiceKnowledgeEntry.deleteMany({
        where: { businessId: other.id },
      });
      await prisma.business.delete({ where: { id: other.id } });
    }
  });
});
