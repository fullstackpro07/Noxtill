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
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('leaves competitors untouched when the Google lookup finds nothing', async () => {
    const competitor = await prisma.competitor.create({
      data: { businessId, platformRef: 'place-123' },
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
      data: { businessId, platformRef: 'place-456' },
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
});
