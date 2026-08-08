import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { SendGateService } from '../messaging/send-gate.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ReviewsService } from './reviews.service';
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

describe('ReviewsService (BE-047)', () => {
  let prisma: PrismaService;
  let reviewsService: ReviewsService;
  let businessId: string;
  let customerId: string;
  const aiInfra = { complete: jest.fn() };
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    reviewsService = new ReviewsService(
      tenantPrisma,
      aiInfra as unknown as AiInfraService,
      sendGate as unknown as SendGateService,
      cls as unknown as ClsService,
    );

    const business = await prisma.business.create({
      data: { name: 'Reviews Test Biz', slug: `reviews-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Rina Reviewer' },
    });
    customerId = customer.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
    aiInfra.complete.mockClear();
  });

  afterAll(async () => {
    await prisma.privateFeedback.deleteMany({ where: { businessId } });
    await prisma.externalReview.deleteMany({ where: { businessId } });
    await prisma.reviewRequest.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('merges external reviews and private feedback into one list, newest first', async () => {
    const older = await prisma.externalReview.create({
      data: {
        businessId,
        platform: 'google',
        externalId: `ext-${Date.now()}`,
        stars: 5,
        text: 'Great!',
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    const newer = await prisma.privateFeedback.create({
      data: { businessId, customerId, stars: 2, message: 'Not great' },
    });

    const list = await reviewsService.list({});
    const ids = list.map((r) => r.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    expect(list.find((r) => r.id === older.id)).toMatchObject({
      source: 'external',
    });
    expect(list.find((r) => r.id === newer.id)).toMatchObject({
      source: 'private',
    });
  });

  it('filters the list to private feedback only when platform=private', async () => {
    const list = await reviewsService.list({ platform: 'private' });
    expect(list.every((r) => r.source === 'private')).toBe(true);
  });

  it('replies to an external review by setting replyText (queued, not yet posted)', async () => {
    const review = await prisma.externalReview.create({
      data: {
        businessId,
        platform: 'google',
        externalId: `ext-reply-${Date.now()}`,
        stars: 4,
        text: 'Nice place',
      },
    });

    const updated = await reviewsService.reply(review.id, 'Thank you!');
    expect(updated.replyText).toBe('Thank you!');
    expect(updated.repliedAt).toBeNull();
  });

  it('drafts an AI reply in the same language via the shared AI infra', async () => {
    aiInfra.complete.mockResolvedValueOnce('¡Muchas gracias!');
    const review = await prisma.externalReview.create({
      data: {
        businessId,
        platform: 'google',
        externalId: `ext-ai-${Date.now()}`,
        stars: 5,
        text: 'Excelente servicio',
      },
    });

    const { draft } = await reviewsService.aiDraft(review.id);
    expect(draft).toBe('¡Muchas gracias!');
    expect(aiInfra.complete).toHaveBeenCalledWith(
      businessId,
      expect.stringContaining('Excelente servicio'),
    );
  });

  it('surfaces a clean AI_UNAVAILABLE error when the AI infra call fails, instead of a raw 500', async () => {
    aiInfra.complete.mockRejectedValueOnce(new Error('network boom'));
    const review = await prisma.externalReview.create({
      data: {
        businessId,
        platform: 'google',
        externalId: `ext-ai-fail-${Date.now()}`,
        stars: 5,
        text: 'Great!',
      },
    });

    let thrown: unknown;
    try {
      await reviewsService.aiDraft(review.id);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppException);
    expect((thrown as AppException).getResponse()).toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
  });

  it('resolving feedback requires a note of at least 5 characters (DTO-level, service just persists)', async () => {
    const feedback = await prisma.privateFeedback.create({
      data: { businessId, customerId, stars: 1, message: 'Bad' },
    });

    const resolved = await reviewsService.updateFeedback(feedback.id, {
      status: 'resolved',
      resolutionNote: 'Called and refunded',
    });
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolutionNote).toBe('Called and refunded');
  });

  it('sends a direct reply to the customer who left the feedback', async () => {
    const feedback = await prisma.privateFeedback.create({
      data: { businessId, customerId, stars: 2, message: 'Slow service' },
    });

    await reviewsService.replyToFeedback(feedback.id, "Sorry about that!");
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        customerId,
        templateKey: 'feedback_reply',
        variables: { message: "Sorry about that!" },
      }),
    );
  });

  it('refuses to reply to feedback with no linked customer', async () => {
    const feedback = await prisma.privateFeedback.create({
      data: { businessId, stars: 2, message: 'Anonymous complaint' },
    });

    await expect(
      reviewsService.replyToFeedback(feedback.id, 'Hi there'),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('computes a real summary: average, distribution, and conversion', async () => {
    const summary = await reviewsService.getSummary();
    expect(summary.averageRating).toBeGreaterThan(0);
    expect(summary.distribution).toHaveLength(5);
    expect(summary.conversion.requested).toBeGreaterThanOrEqual(0);
    expect(summary.latestReview).not.toBeNull();
  });
});
