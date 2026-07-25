import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { LocaleService } from '../common/localization/locale.service';
import { BranchAdvisorService } from './branch-advisor.service';
import { AiInfraService } from '../ai/ai-infra.service';
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

describe('BranchAdvisorService (BE-060)', () => {
  let prisma: PrismaService;
  let service: BranchAdvisorService;
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
    service = new BranchAdvisorService(
      tenantPrisma,
      new LocaleService(),
      aiInfra as unknown as AiInfraService,
    );

    const business = await prisma.business.create({
      data: { name: 'Advisor Test Biz', slug: `advisor-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    aiInfra.complete.mockClear();
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it("always includes the 'based on your own data' disclaimer", async () => {
    aiInfra.complete.mockResolvedValue(
      'Your revenue is trending up this month.',
    );

    const result = await service.ask(businessId, {
      question: 'How is this branch doing?',
    });
    expect(result.disclaimer).toMatch(/own branch's data/i);
    expect(aiInfra.complete).toHaveBeenCalledWith(
      businessId,
      expect.stringContaining('Advisor Test Biz'),
    );
  });

  it('throws a typed AI_UNAVAILABLE error when Claude fails', async () => {
    aiInfra.complete.mockRejectedValue(new Error('network error'));

    await expect(
      service.ask(businessId, { question: 'How is this branch doing?' }),
    ).rejects.toBeInstanceOf(AppException);
  });
});
