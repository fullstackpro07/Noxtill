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
    // AI Assistant depth fix (UPD-INT-014): `mockReset` (not `mockClear`) — a `mockResolvedValue`
    // set by an earlier test must never leak its return value into a later test that expects the
    // model to not be called at all; `mockClear` only resets call history, not queued return values.
    aiInfra.complete.mockReset();
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
      0,
      'help_ask',
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

  describe('retrieval quality (AI Assistant depth fix, UPD-INT-014)', () => {
    it('never cites an unrelated article whose only "match" is a real word coincidentally prefix-matching a different word', async () => {
      // "run*" (a genuine, non-filler word from the query below) would otherwise prefix-match
      // "running" here via MySQL's boolean-mode wildcard — a real but coincidental, weak hit that
      // must not outweigh the frobnicator article's much stronger, genuinely on-topic match.
      const decoySlug = `help-decoy-article-${Date.now()}`;
      try {
        await prisma.helpArticle.create({
          data: {
            slug: decoySlug,
            title: 'How weekly reports are generated',
            body: 'Reports are running on a schedule and have nothing to do with kitchen appliances.',
            url: `/help/${decoySlug}`,
          },
        });

        aiInfra.complete.mockResolvedValue(
          'The frobnicator runs nightly (see [1]).',
        );
        const result = await service.ask('biz-1', {
          question: 'When does the frobnicator run?',
        });

        expect(result.sources).toEqual([
          { title: 'How the frobnicator widget works', url: `/help/${slug}` },
        ]);
      } finally {
        await prisma.helpArticle.delete({ where: { slug: decoySlug } });
      }
    });

    it('never wildcard-matches a filler word from the question against unrelated real content', async () => {
      // "is*"/"an*"/"the*" would otherwise prefix-match real words like "issue"/"and"/"there" in
      // totally unrelated articles via MySQL's boolean-mode wildcard, bypassing MySQL's own
      // stopword filtering — this article exists specifically to prove they no longer do.
      const decoySlug = `help-filler-decoy-${Date.now()}`;
      try {
        await prisma.helpArticle.create({
          data: {
            slug: decoySlug,
            title: 'Resolving an account issue',
            body: 'If there is an unresolved issue, contact support and answer their questions.',
            url: `/help/${decoySlug}`,
          },
        });

        const result = await service.ask('biz-1', {
          question: 'What is the airspeed velocity of an unladen swallow?',
        });

        expect(result.sources).toEqual([]);
        expect(result.answer).toBe(HELP_NOT_FOUND_MESSAGE);
        expect(aiInfra.complete).not.toHaveBeenCalled();
      } finally {
        await prisma.helpArticle.delete({ where: { slug: decoySlug } });
      }
    });
  });
});
