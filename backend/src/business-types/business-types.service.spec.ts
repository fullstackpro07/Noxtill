import { PrismaService } from '../prisma/prisma.service';
import { BusinessTypesService } from './business-types.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';

describe('BusinessTypesService (BE-069)', () => {
  let prisma: PrismaService;
  let service: BusinessTypesService;
  let categoryId: string;
  const aiInfra = { complete: jest.fn() };
  const typeKeys: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new BusinessTypesService(
      prisma,
      aiInfra as unknown as AiInfraService,
    );

    const category = await prisma.businessCategory.upsert({
      where: { key: 'bts-test-category' },
      create: { key: 'bts-test-category', name: 'Test Category' },
      update: {},
    });
    categoryId = category.id;

    const type = await prisma.businessType.upsert({
      where: { key: 'bts-test-salon' },
      create: { key: 'bts-test-salon', label: 'Test Salon', categoryId },
      update: {},
    });
    typeKeys.push(type.key);
  });

  afterEach(() => {
    aiInfra.complete.mockClear();
  });

  afterAll(async () => {
    await prisma.businessType.deleteMany({ where: { key: { in: typeKeys } } });
    await prisma.businessCategory.delete({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('finds existing types by a partial, case-insensitive label match', async () => {
    const results = await service.search('salon');
    expect(results.some((t) => t.key === 'bts-test-salon')).toBe(true);
  });

  it('returns an existing type when Claude matches its key exactly', async () => {
    aiInfra.complete.mockResolvedValue('bts-test-salon');

    const result = await service.aiMap({
      description: 'We cut hair and do nails',
    });
    expect(result.key).toBe('bts-test-salon');
    expect(aiInfra.complete).toHaveBeenCalledWith(
      undefined,
      expect.any(String),
    );
  });

  it('creates a new ai_generated type when Claude finds no existing match', async () => {
    const uniqueLabel = `Pet Grooming ${Date.now()}`;
    aiInfra.complete.mockResolvedValue(`NEW: ${uniqueLabel}`);

    const result = await service.aiMap({
      description: 'We wash and groom dogs',
    });
    typeKeys.push(result.key);

    expect(result.label).toBe(uniqueLabel);
    expect(result.aiGenerated).toBe(true);
  });

  it('wraps a Claude failure as a clean AI_UNAVAILABLE error instead of a raw 500', async () => {
    aiInfra.complete.mockRejectedValue(new Error('x-api-key header is required'));

    await expect(
      service.aiMap({ description: 'We wash and groom dogs' }),
    ).rejects.toBeInstanceOf(AppException);
  });
});
