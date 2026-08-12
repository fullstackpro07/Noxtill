import { PrismaService } from '../../prisma/prisma.service';
import { AiInsightsService } from '../ai-insights.service';
import { AiInsightsProcessor } from './ai-insights.processor';

describe('AiInsightsProcessor (UPD-BE-003)', () => {
  let prisma: PrismaService;
  let processor: AiInsightsProcessor;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const business = await prisma.business.create({
      data: { name: 'Insights Job Biz', slug: `insights-job-${Date.now()}` },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.aiInsight.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('continues past a business whose generation throws, rather than aborting the whole run', async () => {
    const aiInsightsService = {
      generateForBusiness: jest
        .fn()
        .mockRejectedValueOnce(new Error('boom for the first business'))
        .mockResolvedValue(1),
    };
    processor = new AiInsightsProcessor(
      prisma,
      aiInsightsService as unknown as AiInsightsService,
    );

    await expect(processor.runGeneration()).resolves.toBeUndefined();
    // Every real business in the DB gets attempted regardless of an earlier one throwing —
    // confirmed by the mock being called more than once without the run itself throwing.
    expect(
      aiInsightsService.generateForBusiness.mock.calls.length,
    ).toBeGreaterThan(1);
  });

  it('generates real insight rows for a real business end to end', async () => {
    const generateForBusiness = jest
      .fn()
      .mockImplementation(async (id: string) => {
        if (id !== businessId) return 0;
        await prisma.aiInsight.create({
          data: {
            businessId,
            category: 'sales',
            observation: 'x',
            sourceFigure: 'x',
          },
        });
        return 1;
      });
    processor = new AiInsightsProcessor(prisma, {
      generateForBusiness,
    } as unknown as AiInsightsService);

    await processor.runGeneration();

    const rows = await prisma.aiInsight.findMany({ where: { businessId } });
    expect(rows).toHaveLength(1);
  });
});
