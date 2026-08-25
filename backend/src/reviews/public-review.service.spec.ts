import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { PublicReviewService } from './public-review.service';
import { generateReviewToken } from './review-token.util';
import { ActivityService } from '../activity/activity.service';
import type { S3Service } from '../common/storage/s3.service';

describe('PublicReviewService (BE-046)', () => {
  let prisma: PrismaService;
  let service: PublicReviewService;
  let businessId: string;
  let customerId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };
  const activity = { record: jest.fn().mockResolvedValue(undefined) };
  const s3 = {
    getSignedDownloadUrl: jest
      .fn()
      .mockResolvedValue('https://signed.example/logo.png'),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new PublicReviewService(
      prisma,
      sendGate as unknown as SendGateService,
      activity as unknown as ActivityService,
      s3 as unknown as S3Service,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Public Review Test Biz',
        slug: `public-review-test-${Date.now()}`,
        publicReviewUrl: 'https://g.page/test-biz/review',
      },
    });
    businessId = business.id;

    const owner = await prisma.user.create({
      data: {
        email: `owner-${Date.now()}@example.com`,
        passwordHash: 'x',
        name: 'Owner',
      },
    });
    await prisma.businessUser.create({
      data: { businessId, userId: owner.id, role: 'owner' },
    });

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Carol' },
    });
    customerId = customer.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.privateFeedback.deleteMany({ where: { businessId } });
    await prisma.reviewRequest.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('404s for an unknown token', async () => {
    await expect(service.getByToken('does-not-exist')).rejects.toThrow();
  });

  it('routes a 5-star rating to the public review URL', async () => {
    const request = await prisma.reviewRequest.create({
      data: {
        businessId,
        customerId,
        token: generateReviewToken(),
        source: 'order',
      },
    });

    const result = await service.submit(request.token, { stars: 5 });
    expect(result).toEqual({ redirect: 'https://g.page/test-biz/review' });

    const refreshed = await prisma.reviewRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(refreshed.routedTo).toBe('public');
    expect(refreshed.respondedAt).not.toBeNull();
  });

  it('routes a 2-star rating to private feedback and alerts the owner', async () => {
    const request = await prisma.reviewRequest.create({
      data: {
        businessId,
        customerId,
        token: generateReviewToken(),
        source: 'order',
      },
    });

    const result = await service.submit(request.token, {
      stars: 2,
      message: 'Not great',
    });
    expect(result).toEqual({ thankYou: true });

    const feedback = await prisma.privateFeedback.findFirst({
      where: { reviewRequestId: request.id },
    });
    expect(feedback).toMatchObject({
      stars: 2,
      message: 'Not great',
      status: 'open',
    });
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({ businessId, templateKey: 'owner_alert' }),
    );
  });

  it('404s a token that has already been responded to', async () => {
    const request = await prisma.reviewRequest.create({
      data: {
        businessId,
        customerId,
        token: generateReviewToken(),
        source: 'order',
        respondedAt: new Date(),
      },
    });

    await expect(service.getByToken(request.token)).rejects.toThrow();
  });

  it('404s a token older than 30 days', async () => {
    const request = await prisma.reviewRequest.create({
      data: {
        businessId,
        customerId,
        token: generateReviewToken(),
        source: 'order',
        createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      },
    });

    await expect(service.getByToken(request.token)).rejects.toThrow();
  });

  it('returns the widget payload with only 4-5 star external reviews', async () => {
    await prisma.externalReview.createMany({
      data: [
        {
          businessId,
          platform: 'gmb',
          externalId: 'a',
          stars: 5,
          text: 'Great!',
        },
        { businessId, platform: 'gmb', externalId: 'b', stars: 2, text: 'Meh' },
      ],
    });

    const widget = await service.getWidget(
      (await prisma.business.findUniqueOrThrow({ where: { id: businessId } }))
        .slug,
    );
    expect(widget.reviews).toHaveLength(1);
    expect(widget.reviews[0].stars).toBe(5);

    await prisma.externalReview.deleteMany({ where: { businessId } });
  });

  it('resolves real brandColor/logoUrl from reviewSettings on both the rating page and the widget (UPD-FE-086)', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: {
        reviewSettings: {
          brandColor: '#ABCDEF',
          logoKey: 'review-branding/test/logo.png',
        },
      },
    });
    const slug = (
      await prisma.business.findUniqueOrThrow({ where: { id: businessId } })
    ).slug;

    const request = await prisma.reviewRequest.create({
      data: {
        businessId,
        customerId,
        token: generateReviewToken(),
        source: 'order',
      },
    });
    const page = await service.getByToken(request.token);
    expect(page.brandColor).toBe('#ABCDEF');
    expect(page.logoUrl).toBe('https://signed.example/logo.png');
    expect(s3.getSignedDownloadUrl).toHaveBeenCalledWith(
      'review-branding/test/logo.png',
    );

    const widget = await service.getWidget(slug);
    expect(widget.brandColor).toBe('#ABCDEF');
    expect(widget.logoUrl).toBe('https://signed.example/logo.png');

    await prisma.business.update({
      where: { id: businessId },
      data: { reviewSettings: {} },
    });
  });

  it('returns null brandColor/logoUrl when nothing has been set', async () => {
    const request = await prisma.reviewRequest.create({
      data: {
        businessId,
        customerId,
        token: generateReviewToken(),
        source: 'order',
      },
    });
    const page = await service.getByToken(request.token);
    expect(page.brandColor).toBeNull();
    expect(page.logoUrl).toBeNull();
  });

  it('honors a minRating override, clamped to 1-5 (UPD-BE-102)', async () => {
    await prisma.externalReview.createMany({
      data: [
        {
          businessId,
          platform: 'gmb',
          externalId: 'min-a',
          stars: 5,
          text: 'Great!',
        },
        {
          businessId,
          platform: 'gmb',
          externalId: 'min-b',
          stars: 3,
          text: 'Okay',
        },
        {
          businessId,
          platform: 'gmb',
          externalId: 'min-c',
          stars: 1,
          text: 'Bad',
        },
      ],
    });
    const slug = (
      await prisma.business.findUniqueOrThrow({ where: { id: businessId } })
    ).slug;

    const widgetAll = await service.getWidget(slug, 1);
    expect(widgetAll.reviews).toHaveLength(3);

    const widgetHighOnly = await service.getWidget(slug, 5);
    expect(widgetHighOnly.reviews).toHaveLength(1);

    const widgetOutOfRange = await service.getWidget(slug, 99);
    expect(widgetOutOfRange.reviews).toHaveLength(1); // clamped to 5, same as above

    await prisma.externalReview.deleteMany({ where: { businessId } });
  });

  it('mints an anonymous, customerless review request for a QR scan', async () => {
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const result = await service.mintAnonymousLink(business.slug);
    expect(result.token).toHaveLength(32);

    const created = await prisma.reviewRequest.findUniqueOrThrow({
      where: { token: result.token },
    });
    expect(created.customerId).toBeNull();
    expect(created.source).toBe('qr');

    await prisma.reviewRequest.delete({ where: { id: created.id } });
  });

  it('404s minting a link for an unknown slug', async () => {
    await expect(
      service.mintAnonymousLink('no-such-business-slug'),
    ).rejects.toThrow();
  });

  it('marks a request opened on its first real GET, and never regresses it (UPD-BE-100)', async () => {
    const request = await prisma.reviewRequest.create({
      data: {
        businessId,
        customerId,
        token: generateReviewToken(),
        source: 'order',
      },
    });
    expect(request.status).toBe('sent');

    await service.getByToken(request.token);
    const afterFirstOpen = await prisma.reviewRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(afterFirstOpen.status).toBe('opened');
    expect(afterFirstOpen.openedAt).not.toBeNull();
    const firstOpenedAt = afterFirstOpen.openedAt;

    await service.getByToken(request.token);
    const afterSecondOpen = await prisma.reviewRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(afterSecondOpen.openedAt).toEqual(firstOpenedAt);
  });

  it('marks a request rated on submit (UPD-BE-100)', async () => {
    const request = await prisma.reviewRequest.create({
      data: {
        businessId,
        customerId,
        token: generateReviewToken(),
        source: 'order',
      },
    });

    await service.submit(request.token, { stars: 4 });
    const refreshed = await prisma.reviewRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(refreshed.status).toBe('rated');
  });

  it('refuses to mint once a business hits its daily QR-request cap', async () => {
    const capBusiness = await prisma.business.create({
      data: { name: 'Cap Test Biz', slug: `qr-cap-test-${Date.now()}` },
    });

    await prisma.reviewRequest.createMany({
      data: Array.from({ length: 200 }, (_, i) => ({
        businessId: capBusiness.id,
        token: `cap-fill-token-${Date.now()}-${i}`,
        source: 'qr',
      })),
    });

    await expect(service.mintAnonymousLink(capBusiness.slug)).rejects.toThrow();

    await prisma.reviewRequest.deleteMany({
      where: { businessId: capBusiness.id },
    });
    await prisma.business.delete({ where: { id: capBusiness.id } });
  });
});
