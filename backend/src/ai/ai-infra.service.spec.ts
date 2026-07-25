import { PrismaService } from '../prisma/prisma.service';
import { AiInfraService } from './ai-infra.service';
import { ClaudeClient, CreateMessageResult } from './claude.client';
import { AppException } from '../common/filters/app.exception';

function fakeResult(
  overrides: Partial<CreateMessageResult> = {},
): CreateMessageResult {
  return {
    content: [{ type: 'text', text: 'hello' }],
    stopReason: 'end_turn',
    inputTokens: 1000,
    outputTokens: 500,
    ...overrides,
  };
}

describe('AiInfraService (BE-075)', () => {
  let prisma: PrismaService;
  let service: AiInfraService;
  let businessId: string;
  const claude = { createMessage: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new AiInfraService(prisma, claude as unknown as ClaudeClient);

    const business = await prisma.business.create({
      data: {
        name: 'AI Infra Test Biz',
        slug: `ai-infra-test-${Date.now()}`,
        aiRateLimitPerMinute: 2,
        aiMonthlyCostCapUsd: 1,
      },
    });
    businessId = business.id;
  });

  afterEach(() => {
    claude.createMessage.mockClear();
  });

  afterAll(async () => {
    await prisma.aiCallLog.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('completes a prompt and logs the call with an estimated cost', async () => {
    claude.createMessage.mockResolvedValue(fakeResult());

    const text = await service.complete(businessId, 'hi there');
    expect(text).toBe('hello');

    const logs = await prisma.aiCallLog.findMany({ where: { businessId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].inputTokens).toBe(1000);
    expect(Number(logs[0].estimatedCostUsd)).toBeGreaterThan(0);
  });

  it('blocks further calls once the per-minute rate limit is reached', async () => {
    claude.createMessage.mockResolvedValue(fakeResult());

    await service.complete(businessId, 'call 1');
    // Rate limit is 2/min and the previous test already logged 1 call this minute.
    await expect(service.complete(businessId, 'call 2')).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('blocks further calls once the monthly cost cap is exceeded', async () => {
    const capBusiness = await prisma.business.create({
      data: {
        name: 'AI Cost Cap Test Biz',
        slug: `ai-cost-cap-test-${Date.now()}`,
        aiRateLimitPerMinute: 1000,
        aiMonthlyCostCapUsd: 0.01, // 2-decimal-place column (BE-075) — smallest representable cap
      },
    });

    claude.createMessage.mockResolvedValue(
      fakeResult({ inputTokens: 100_000, outputTokens: 100_000 }),
    );
    await service.complete(capBusiness.id, 'expensive call');

    await expect(
      service.complete(capBusiness.id, 'next call'),
    ).rejects.toBeInstanceOf(AppException);

    await prisma.aiCallLog.deleteMany({
      where: { businessId: capBusiness.id },
    });
    await prisma.business.delete({ where: { id: capBusiness.id } });
  });

  it('skips rate-limit/cost-cap checks entirely when no businessId is given (pre-signup calls)', async () => {
    claude.createMessage.mockResolvedValue(fakeResult());

    const text = await service.complete(undefined, 'anonymous call');
    expect(text).toBe('hello');

    const logs = await prisma.aiCallLog.findMany({
      where: { businessId: null },
    });
    expect(logs.length).toBeGreaterThan(0);

    await prisma.aiCallLog.deleteMany({ where: { businessId: null } });
  });
});
