import { PrismaService } from '../prisma/prisma.service';
import { HelpService, HELP_NOT_FOUND_MESSAGE } from './help.service';
import { AiInfraService } from '../ai/ai-infra.service';

describe('HelpService (BE-073)', () => {
  let prisma: PrismaService;
  let service: HelpService;
  const aiInfra = { complete: jest.fn() };
  const slug = `help-test-article-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new HelpService(prisma, aiInfra as unknown as AiInfraService);

    await prisma.helpArticle.create({
      data: {
        slug,
        title: 'How the frobnicator widget works',
        body: 'The frobnicator widget frobnicates your gizmos automatically every night at midnight.',
        url: `/help/${slug}`,
      },
    });
  });

  afterEach(() => {
    aiInfra.complete.mockClear();
  });

  afterAll(async () => {
    await prisma.helpArticle.delete({ where: { slug } });
    await prisma.$disconnect();
  });

  it('retrieves a relevant article and asks the model to answer only from it', async () => {
    aiInfra.complete.mockResolvedValue(
      'The frobnicator runs nightly at midnight (see [1]).',
    );

    const result = await service.ask('biz-1', {
      question: 'When does the frobnicator run?',
    });

    expect(result.sources).toEqual([
      { title: 'How the frobnicator widget works', url: `/help/${slug}` },
    ]);
    expect(aiInfra.complete).toHaveBeenCalledWith(
      'biz-1',
      expect.stringContaining('frobnicate'),
    );
    expect(result.answer).toContain('midnight');
  });

  it('returns an honest not-found answer without calling the model when nothing matches', async () => {
    const result = await service.ask('biz-1', {
      question: 'What is the airspeed velocity of an unladen swallow?',
    });

    expect(result.answer).toBe(HELP_NOT_FOUND_MESSAGE);
    expect(result.sources).toEqual([]);
    expect(aiInfra.complete).not.toHaveBeenCalled();
  });
});
