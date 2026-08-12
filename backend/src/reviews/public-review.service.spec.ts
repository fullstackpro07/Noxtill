import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { PublicReviewService } from './public-review.service';
import { generateReviewToken } from './review-token.util';
import { ActivityService } from '../activity/activity.service';

describe('PublicReviewService (BE-046)', () => {
  let prisma: PrismaService;
  let service: PublicReviewService;
  let businessId: string;
  let customerId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };
  const activity = { record: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new PublicReviewService(
      prisma,
      sendGate as unknown as SendGateService,
      activity as unknown as ActivityService,
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

    await expect(
      service.mintAnonymousLink(capBusiness.slug),
    ).rejects.toThrow();

    await prisma.reviewRequest.deleteMany({
      where: { businessId: capBusiness.id },
    });
    await prisma.business.delete({ where: { id: capBusiness.id } });
  });
});
