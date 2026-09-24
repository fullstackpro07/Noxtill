import { PrismaService } from '../../prisma/prisma.service';
import { CompetitorSnapshotProcessor } from './competitor-snapshot.processor';
import { GooglePlacesService } from '../google-places.service';

describe('CompetitorSnapshotProcessor (BE-063)', () => {
  let prisma: PrismaService;
  let processor: CompetitorSnapshotProcessor;
  let businessId: string;
  const googlePlaces = { fetchPlaceSnapshot: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new CompetitorSnapshotProcessor(
      prisma,
      googlePlaces as unknown as GooglePlacesService,
    );

    const business = await prisma.business.create({
      data: { name: 'Snapshot Test Biz', slug: `snapshot-test-${Date.now()}` },
    });
    businessId = business.id;
  });

  afterEach(() => {
    googlePlaces.fetchPlaceSnapshot.mockReset();
  });

  afterAll(async () => {
    const competitors = await prisma.competitor.findMany({
      where: { businessId },
    });
    await prisma.competitorSnapshot.deleteMany({
      where: { competitorId: { in: competitors.map((c) => c.id) } },
    });
    await prisma.competitor.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('leaves competitors untouched when the Google lookup finds nothing', async () => {
    const competitor = await prisma.competitor.create({
      data: { businessId, name: 'Place 123', platformRef: 'place-123' },
    });
    googlePlaces.fetchPlaceSnapshot.mockResolvedValue(null);

    await processor.runSnapshot();

    const refreshed = await prisma.competitor.findUniqueOrThrow({
      where: { id: competitor.id },
    });
    expect(refreshed.lastRating).toBeNull();
    expect(refreshed.lastReviewsCount).toBeNull();
  });

  it('records the latest snapshot and a permanent history row when the lookup succeeds', async () => {
    const competitor = await prisma.competitor.create({
      data: { businessId, name: 'Place 456', platformRef: 'place-456' },
    });
    googlePlaces.fetchPlaceSnapshot.mockResolvedValue({
      rating: 4.6,
      reviewsCount: 210,
    });

    await processor.snapshotOne(competitor.id, competitor.platformRef);

    const refreshed = await prisma.competitor.findUniqueOrThrow({
      where: { id: competitor.id },
    });
    expect(Number(refreshed.lastRating)).toBe(4.6);
    expect(refreshed.lastReviewsCount).toBe(210);

    const history = await prisma.competitorSnapshot.findMany({
      where: { competitorId: competitor.id },
    });
    expect(history).toHaveLength(1);
    expect(Number(history[0].rating)).toBe(4.6);
  });

  describe('scan frequency (Competitive Settings)', () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
    const seed = async (ref: string, snapshotDaysAgo: number) => {
      const c = await prisma.competitor.create({
        data: { businessId, name: ref, platformRef: ref },
      });
      await prisma.competitorSnapshot.create({
        data: {
          competitorId: c.id,
          rating: 4.0,
          reviewsCount: 10,
          capturedAt: daysAgo(snapshotDaysAgo),
        },
      });
    };
    const refsLookedUp = () =>
      (googlePlaces.fetchPlaceSnapshot.mock.calls as [string][]).map(
        (c) => c[0],
      );

    afterAll(async () => {
      await prisma.competitiveSettings.deleteMany({ where: { businessId } });
    });

    it('uses the default 7 days when the business has never set a frequency', async () => {
      googlePlaces.fetchPlaceSnapshot.mockResolvedValue(null);
      await seed('freq-default-not-due', 5);
      await seed('freq-default-due', 8);

      await processor.runSnapshot();

      expect(refsLookedUp()).toContain('freq-default-due');
      expect(refsLookedUp()).not.toContain('freq-default-not-due');
    });

    it('honours a shorter frequency the owner has chosen', async () => {
      await prisma.competitiveSettings.upsert({
        where: { businessId },
        create: { businessId, scanFrequencyDays: 2 },
        update: { scanFrequencyDays: 2 },
      });
      googlePlaces.fetchPlaceSnapshot.mockResolvedValue(null);
      await seed('freq-two-not-due', 1);
      await seed('freq-two-due', 3);

      await processor.runSnapshot();

      expect(refsLookedUp()).toContain('freq-two-due');
      expect(refsLookedUp()).not.toContain('freq-two-not-due');
    });

    it('always looks up a competitor that has never been snapshotted', async () => {
      googlePlaces.fetchPlaceSnapshot.mockResolvedValue(null);
      await prisma.competitor.create({
        data: { businessId, name: 'never', platformRef: 'freq-never' },
      });

      await processor.runSnapshot();

      expect(refsLookedUp()).toContain('freq-never');
    });
  });
});
