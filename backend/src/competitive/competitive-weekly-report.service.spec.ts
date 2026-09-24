import { PrismaService } from '../prisma/prisma.service';
import type { EmailService } from '../messaging/channels/email.service';
import { CompetitiveWeeklyReportService } from './competitive-weekly-report.service';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe('CompetitiveWeeklyReportService', () => {
  let prisma: PrismaService;
  let service: CompetitiveWeeklyReportService;
  let businessId: string;
  let noRecipientBusinessId: string;
  // The email provider is the one thing mocked — a spec must never send a real email.
  const email = { send: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new CompetitiveWeeklyReportService(
      prisma,
      email as unknown as EmailService,
    );

    const stamp = Date.now();
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Report Salon',
          slug: `weekly-report-${stamp}`,
          currency: 'PKR',
        },
      })
    ).id;
    noRecipientBusinessId = (
      await prisma.business.create({
        data: { name: 'Silent Salon', slug: `weekly-report-silent-${stamp}` },
      })
    ).id;

    const fresh = await prisma.competitor.create({
      data: { businessId, name: 'Fresh Fades', platformRef: 'ff' },
    });
    await prisma.competitorSnapshot.createMany({
      data: [
        {
          competitorId: fresh.id,
          rating: 4.4,
          reviewsCount: 90,
          capturedAt: daysAgo(9),
        },
        {
          competitorId: fresh.id,
          rating: 4.5,
          reviewsCount: 96,
          capturedAt: daysAgo(1),
        },
      ],
    });
    await prisma.competitor.create({
      data: { businessId, name: 'Brand New Co', platformRef: 'bn' },
    });
    await prisma.competitorObservation.create({
      data: {
        businessId,
        competitorId: fresh.id,
        kind: 'price',
        label: 'Express cut',
        amount: 1900,
        observedAt: daysAgo(2),
      },
    });
    await prisma.competitiveOpportunity.create({
      data: {
        businessId,
        kind: 'review',
        evidence: '2 review(s) still awaiting a reply',
        recommendation: 'Reply to them today.',
      },
    });
    await prisma.competitiveSettings.create({
      data: { businessId, weeklyReportRecipient: 'owner@report-salon.example' },
    });
  });

  beforeEach(() => email.send.mockReset());

  afterAll(async () => {
    await prisma.competitorObservation.deleteMany({ where: { businessId } });
    await prisma.competitiveOpportunity.deleteMany({ where: { businessId } });
    await prisma.competitiveSettings.deleteMany({ where: { businessId } });
    const comps = await prisma.competitor.findMany({ where: { businessId } });
    await prisma.competitorSnapshot.deleteMany({
      where: { competitorId: { in: comps.map((c) => c.id) } },
    });
    await prisma.competitor.deleteMany({ where: { businessId } });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, noRecipientBusinessId] } },
    });
    await prisma.$disconnect();
  });

  it('builds the report from real rows: rating movement, recorded prices, open gaps', async () => {
    const text = await service.build(businessId);
    expect(text).toContain('Competitive insights for Report Salon');
    expect(text).toContain('Fresh Fades: 4.5 from 96 reviews');
    expect(text).toContain('+0.1 rating, +6 reviews in the last 7 days');
    expect(text).toContain('Brand New Co: no rating read yet');
    expect(text).toContain('Fresh Fades (price): Express cut');
    expect(text).toContain('Open gaps (1)');
    expect(text).toContain('Reply to them today.');
  });

  it('sends to the recipient set in Competitive Settings', async () => {
    email.send.mockResolvedValue({ providerRef: 'msg-1' });

    const result = await service.sendForBusiness(businessId);

    expect(result).toEqual({
      sent: true,
      recipient: 'owner@report-salon.example',
    });
    expect(email.send).toHaveBeenCalledTimes(1);
    const [params] = email.send.mock.calls[0] as [
      { to: string; text: string; businessId: string },
    ];
    expect(params.to).toBe('owner@report-salon.example');
    expect(params.businessId).toBe(businessId);
    expect(params.text).toContain('Fresh Fades');
  });

  it('sends nothing when no recipient is set', async () => {
    const result = await service.sendForBusiness(noRecipientBusinessId);
    expect(result).toMatchObject({ sent: false, reason: 'no_recipient' });
    expect(email.send).not.toHaveBeenCalled();
  });

  it('reports a provider failure instead of throwing', async () => {
    email.send.mockRejectedValue(new Error('provider down'));
    const result = await service.sendForBusiness(businessId);
    expect(result).toMatchObject({ sent: false, reason: 'send_failed' });
  });
});
