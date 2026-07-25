import { PrismaService } from '../../prisma/prisma.service';
import { CompetitorSnapshotProcessor } from './competitor-snapshot.processor';

describe('CompetitorSnapshotProcessor (BE-063)', () => {
  let prisma: PrismaService;
  let processor: CompetitorSnapshotProcessor;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new CompetitorSnapshotProcessor(prisma);

    const business = await prisma.business.create({
      data: { name: 'Snapshot Test Biz', slug: `snapshot-test-${Date.now()}` },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.competitor.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('runs without error and leaves competitors untouched while the Google lookup is stubbed', async () => {
    const competitor = await prisma.competitor.create({
      data: { businessId, platformRef: 'place-123' },
    });

    await processor.runSnapshot();

    const refreshed = await prisma.competitor.findUniqueOrThrow({
      where: { id: competitor.id },
    });
    expect(refreshed.lastRating).toBeNull();
    expect(refreshed.lastReviewsCount).toBeNull();
  });
});
