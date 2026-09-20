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
    await prisma.helpQueryLog.deleteMany({ where: { businessId: 'biz-1' } });
    await prisma.$disconnect();
  });

  it('retrieves a relevant article and asks the model to answer only from it', async () => {
    aiInfra.complete.mockResolvedValue(
      'The frobnicator runs nightly at midnight (see [1]).',
    );

    const result = await service.ask('biz-1', 'user-1', {
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

  it('logs every real ask (Chat History unification) — a found answer records the real question, answer and sources', async () => {
    aiInfra.complete.mockResolvedValue('The frobnicator runs nightly (see [1]).');

    await service.ask('biz-1', 'user-1', {
      question: 'When does the frobnicator run tonight?',
    });

    const logged = await prisma.helpQueryLog.findFirst({
      where: { businessId: 'biz-1', userId: 'user-1', question: 'When does the frobnicator run tonight?' },
      orderBy: { createdAt: 'desc' },
    });
    expect(logged).not.toBeNull();
    expect(logged?.answer).toBe('The frobnicator runs nightly (see [1]).');
    expect(logged?.sources).toEqual([{ title: 'How the frobnicator widget works', url: `/help/${slug}` }]);
  });

  it('returns an honest not-found answer without calling the model when nothing matches', async () => {
    const result = await service.ask('biz-1', 'user-1', {
      question: 'What is the airspeed velocity of an unladen swallow?',
    });

    expect(result.answer).toBe(HELP_NOT_FOUND_MESSAGE);
    expect(result.sources).toEqual([]);
    expect(aiInfra.complete).not.toHaveBeenCalled();
  });

  it('logs an honest not-found ask too — a real interaction, not just a real answer', async () => {
    await service.ask('biz-1', 'user-1', {
      question: 'What is the airspeed velocity of a coconut-laden swallow?',
    });

    const logged = await prisma.helpQueryLog.findFirst({
      where: { businessId: 'biz-1', userId: 'user-1', question: 'What is the airspeed velocity of a coconut-laden swallow?' },
    });
    expect(logged).not.toBeNull();
    expect(logged?.answer).toBe(HELP_NOT_FOUND_MESSAGE);
    expect(logged?.sources).toEqual([]);
  });

  describe('suggestions', () => {
    const usageBiz = `biz-suggest-usage-${Date.now()}`;
    const emptyBiz = `biz-suggest-empty-${Date.now()}`;

    afterAll(async () => {
      await prisma.helpQueryLog.deleteMany({ where: { businessId: { in: [usageBiz, emptyBiz] } } });
    });

    it('returns only questions this business really asked 2+ times and got answered, once there are 3+ of them', async () => {
      const answered = (question: string) => ({ businessId: usageBiz, userId: 'u', question, answer: 'A real answer.', sources: [] });
      await prisma.helpQueryLog.createMany({
        data: [
          answered('How do I take a sale on credit?'),
          answered('How do I take a sale on credit?'),
          answered('How do review requests work?'),
          answered('How do review requests work?'),
          answered('How do review requests work?'),
          answered('How is campaign quota calculated?'),
          answered('How is campaign quota calculated?'),
          // asked twice but never answered — must not count as popular
          { businessId: usageBiz, userId: 'u', question: 'Something undocumented?', answer: HELP_NOT_FOUND_MESSAGE, sources: [] },
          { businessId: usageBiz, userId: 'u', question: 'Something undocumented?', answer: HELP_NOT_FOUND_MESSAGE, sources: [] },
          // asked once — not popular
          answered('How do plans work?'),
        ],
      });

      const result = await service.suggestions(usageBiz);
      expect(result.basedOn).toBe('usage');
      expect(result.questions).toEqual([
        'How do review requests work?',
        expect.stringMatching(/credit\?$|quota calculated\?$/),
        expect.stringMatching(/credit\?$|quota calculated\?$/),
      ]);
      expect(result.questions).not.toContain('Something undocumented?');
      expect(result.questions).not.toContain('How do plans work?');
    });

    it('falls back to real article titles, labelled as documentation, when usage is too thin to call anything popular', async () => {
      const result = await service.suggestions(emptyBiz);
      expect(result.basedOn).toBe('documentation');
      expect(result.questions.length).toBeGreaterThan(0);
      expect(result.questions.length).toBeLessThanOrEqual(5);
      for (const q of result.questions) expect(q.endsWith('?')).toBe(true);
    });
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
        const result = await service.ask('biz-1', 'user-1', {
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

        const result = await service.ask('biz-1', 'user-1', {
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
