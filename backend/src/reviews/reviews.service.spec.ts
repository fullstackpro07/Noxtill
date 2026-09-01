import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { SendGateService } from '../messaging/send-gate.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AppException } from '../common/filters/app.exception';
import type { S3Service } from '../common/storage/s3.service';

// file-type is ESM-only; its dynamic import() isn't supported under ts-jest's CommonJS
// transform (unrelated to real Node runtime, where dynamic import works fine — same
// pre-existing issue already worked around in customer-import.service.spec.ts). Mocking the
// whole util here keeps this spec focused on ReviewsService's own upload/removal wiring.
jest.mock('../common/utils/file-validation.util', () => ({
  validateUploadedFile: jest.fn().mockResolvedValue(undefined),
}));

import { ReviewsService } from './reviews.service';

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
  const s3 = {
    getSignedDownloadUrl: jest
      .fn()
      .mockResolvedValue('https://signed.example/logo.png'),
    upload: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };

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
      s3 as unknown as S3Service,
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
      0,
      'review_reply',
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

    await reviewsService.replyToFeedback(feedback.id, 'Sorry about that!');
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        customerId,
        templateKey: 'feedback_reply',
        variables: { message: 'Sorry about that!' },
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

  describe('review requests (UPD-BE-100)', () => {
    it('reports effective status: sent stays sent, rated stays rated, and an old sent request becomes no_response', async () => {
      const sent = await prisma.reviewRequest.create({
        data: {
          businessId,
          customerId,
          token: `t-sent-${Date.now()}`,
          source: 'order',
        },
      });
      const rated = await prisma.reviewRequest.create({
        data: {
          businessId,
          customerId,
          token: `t-rated-${Date.now()}`,
          source: 'order',
          status: 'rated',
          respondedAt: new Date(),
        },
      });
      const expired = await prisma.reviewRequest.create({
        data: {
          businessId,
          customerId,
          token: `t-expired-${Date.now()}`,
          source: 'qr',
          createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        },
      });

      const requests = await reviewsService.listRequests();
      const byId = new Map(requests.map((r) => [r.id, r.effectiveStatus]));
      expect(byId.get(sent.id)).toBe('sent');
      expect(byId.get(rated.id)).toBe('rated');
      expect(byId.get(expired.id)).toBe('no_response');
    });

    it('groups conversion by real source values, not a hardcoded channel list', async () => {
      await prisma.reviewRequest.create({
        data: {
          businessId,
          customerId,
          token: `t-conv-a-${Date.now()}`,
          source: 'carrier_pigeon',
          status: 'rated',
          respondedAt: new Date(),
        },
      });
      await prisma.reviewRequest.create({
        data: {
          businessId,
          customerId,
          token: `t-conv-b-${Date.now()}`,
          source: 'carrier_pigeon',
        },
      });

      const byChannel = await reviewsService.conversionByChannel();
      const pigeon = byChannel.find((c) => c.source === 'carrier_pigeon');
      expect(pigeon).toMatchObject({ total: 2, rated: 1, conversionRate: 50 });
    });

    it('scopes QR stats to source=qr and computes a real conversion rate', async () => {
      await prisma.reviewRequest.create({
        data: {
          businessId,
          token: `t-qr-a-${Date.now()}`,
          source: 'qr',
          status: 'rated',
          respondedAt: new Date(),
        },
      });
      await prisma.reviewRequest.create({
        data: { businessId, token: `t-qr-b-${Date.now()}`, source: 'qr' },
      });

      const stats = await reviewsService.qrStats();
      expect(stats.visits).toBeGreaterThanOrEqual(2);
      expect(stats.ratingsSubmitted).toBeGreaterThanOrEqual(1);
      expect(stats.conversionRate).toBeGreaterThan(0);
    });
  });

  describe('review settings (UPD-BE-104)', () => {
    it('round-trips publicReviewUrl through the dedicated column and the rest through the JSON blob', async () => {
      const updated = await reviewsService.updateSettings({
        publicReviewUrl: 'https://g.page/r/test',
        publicReviewPlatform: 'google',
        reminderDayOffsets: [2, 5],
        replyTemplates: { en: 'Thanks so much!' },
      });

      expect(updated).toMatchObject({
        publicReviewUrl: 'https://g.page/r/test',
        publicReviewPlatform: 'google',
        reminderDayOffsets: [2, 5],
        replyTemplates: { en: 'Thanks so much!' },
      });

      const fetched = await reviewsService.getSettings();
      expect(fetched).toMatchObject(updated);
    });

    it('a partial update only touches the fields it sends, keeping the rest', async () => {
      await reviewsService.updateSettings({ publicReviewPlatform: 'yelp' });
      const fetched = await reviewsService.getSettings();
      expect(fetched.publicReviewPlatform).toBe('yelp');
      expect(fetched.publicReviewUrl).toBe('https://g.page/r/test');
    });

    it('stores a real brandColor and returns it on read (UPD-FE-086)', async () => {
      await reviewsService.updateSettings({ brandColor: '#112233' });
      const fetched = await reviewsService.getSettings();
      expect(fetched.brandColor).toBe('#112233');
    });
  });

  describe('branding logo (UPD-FE-086)', () => {
    afterEach(async () => {
      s3.upload.mockClear();
      s3.delete.mockClear();
      s3.getSignedDownloadUrl.mockClear();
      // Each test uploads its own logo(s) against the real DB row — reset so the next test never
      // inherits a leftover logoKey (which would otherwise trigger an extra, unrelated delete call).
      await prisma.business.update({
        where: { id: businessId },
        data: { reviewSettings: {} },
      });
    });

    it('uploads a real logo to S3 and resolves it to a fresh signed URL on read', async () => {
      const result = await reviewsService.uploadLogo({
        buffer: Buffer.from('fake-png-bytes'),
        size: 14,
        mimetype: 'image/png',
      });

      expect(s3.upload).toHaveBeenCalledWith(
        expect.stringContaining(`review-branding/${businessId}/logo-`),
        expect.any(Buffer),
        'image/png',
      );
      expect(result.logoUrl).toBe('https://signed.example/logo.png');
    });

    it('deletes the previous logo from S3 when a new one replaces it', async () => {
      await reviewsService.uploadLogo({
        buffer: Buffer.from('a'),
        size: 1,
        mimetype: 'image/png',
      });
      s3.upload.mockClear();
      await reviewsService.uploadLogo({
        buffer: Buffer.from('b'),
        size: 1,
        mimetype: 'image/png',
      });

      expect(s3.delete).toHaveBeenCalledTimes(1);
    });

    it('removes the logo and clears logoKey from settings', async () => {
      await reviewsService.uploadLogo({
        buffer: Buffer.from('a'),
        size: 1,
        mimetype: 'image/png',
      });
      const removed = await reviewsService.removeLogo();

      expect(s3.delete).toHaveBeenCalled();
      expect(removed.logoUrl).toBeNull();
    });
  });
});
