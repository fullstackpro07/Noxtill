import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CompetitorsService } from './competitors.service';
import { AppException } from '../common/filters/app.exception';
import { MAX_COMPETITORS } from './marketing.constants';
import type { CompetitorSnapshotProcessor } from './jobs/competitor-snapshot.processor';
import type { MetaAdLibraryService } from './meta-ad-library.service';
import type { GooglePlacesService } from './google-places.service';
import type { S3Service } from '../common/storage/s3.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CompetitorsService (BE-063)', () => {
  let prisma: PrismaService;
  let service: CompetitorsService;
  let businessId: string;
  const snapshotProcessor = { snapshotOne: jest.fn() };
  const adLibrary = { fetchAds: jest.fn() };
  const places = {
    searchPlaces: jest.fn(),
    fetchPlaceDetails: jest.fn(),
    fetchPhoto: jest.fn(),
  };
  const s3 = { uploadAndSign: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new CompetitorsService(
      tenantPrisma,
      snapshotProcessor as unknown as CompetitorSnapshotProcessor,
      adLibrary as unknown as MetaAdLibraryService,
      places as unknown as GooglePlacesService,
      s3 as unknown as S3Service,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Competitors Test Biz',
        slug: `competitors-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
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

  it(`allows up to ${MAX_COMPETITORS} competitors and rejects the next add`, async () => {
    for (let i = 0; i < MAX_COMPETITORS; i++) {
      await service.create(businessId, {
        name: `Place ${i}`,
        platformRef: `place-${i}`,
      });
    }

    await expect(
      service.create(businessId, {
        name: 'One Too Many',
        platformRef: 'one-too-many',
      }),
    ).rejects.toBeInstanceOf(AppException);

    const list = await service.list();
    expect(list).toHaveLength(MAX_COMPETITORS);
  });

  it('removes a competitor, freeing a slot', async () => {
    const list = await service.list();
    await service.remove(list[0].id);

    const created = await service.create(businessId, {
      name: 'Replacement',
      platformRef: 'replacement',
    });
    expect(created.platformRef).toBe('replacement');
  });

  it('search() delegates straight to GooglePlacesService', async () => {
    const results = [
      {
        placeId: 'p1',
        name: 'Rival Cafe',
        address: null,
        rating: 4.5,
        userRatingsTotal: 200,
      },
    ];
    places.searchPlaces.mockResolvedValue(results);
    const result = await service.search('rival cafe');
    expect(result).toBe(results);
    expect(places.searchPlaces).toHaveBeenCalledWith('rival cafe');
  });

  it('returns snapshot history oldest-first', async () => {
    const competitor = await prisma.competitor.create({
      data: { businessId, name: 'History Test', platformRef: 'history-test' },
    });
    await prisma.competitorSnapshot.createMany({
      data: [
        {
          competitorId: competitor.id,
          rating: 4.2,
          reviewsCount: 100,
          capturedAt: new Date('2026-01-01'),
        },
        {
          competitorId: competitor.id,
          rating: 4.4,
          reviewsCount: 110,
          capturedAt: new Date('2026-01-08'),
        },
      ],
    });

    const history = await service.history(competitor.id);
    expect(history).toHaveLength(2);
    expect(history[0].rating).toBe(4.2);
    expect(history[1].rating).toBe(4.4);
  });

  it('averages only rated competitors, excluding ones with no snapshot yet (UPD-FE-089)', async () => {
    const list = await service.list();
    await prisma.competitor.update({
      where: { id: list[0].id },
      data: { lastRating: 4.0, lastReviewsCount: 20 },
    });
    await prisma.competitor.update({
      where: { id: list[1].id },
      data: { lastRating: 4.6, lastReviewsCount: 40 },
    });
    // The rest of `list` stays unrated (null lastRating) — must not count as 0 in the average.

    const result = await service.categoryAverage();
    expect(result.trackedCount).toBe(list.length);
    expect(result.ratedCount).toBe(2);
    expect(result.averageRating).toBe(4.3);
  });

  describe('Competitor detail depth fix (hours/reviews/photos)', () => {
    it('details() returns real hours/reviews and re-uploads real photo bytes to S3', async () => {
      const competitor = await prisma.competitor.create({
        data: {
          businessId,
          name: 'Detail Test',
          platformRef: 'place-detail-1',
        },
      });
      places.fetchPlaceDetails.mockResolvedValue({
        hours: ['Monday: 9AM–5PM'],
        reviews: [
          {
            authorName: 'A. Customer',
            rating: 5,
            text: 'Great!',
            relativeTime: 'a week ago',
          },
        ],
        photoReferences: ['ref-1', 'ref-2'],
      });
      places.fetchPhoto.mockResolvedValue({
        buffer: Buffer.from('fake-image-bytes'),
        contentType: 'image/jpeg',
      });
      s3.uploadAndSign.mockResolvedValue(
        'https://signed.example.com/photo.jpg',
      );

      const result = await service.details(competitor.id);
      expect(result.hours).toEqual(['Monday: 9AM–5PM']);
      expect(result.reviews).toHaveLength(1);
      expect(result.photos).toEqual([
        'https://signed.example.com/photo.jpg',
        'https://signed.example.com/photo.jpg',
      ]);
      expect(places.fetchPlaceDetails).toHaveBeenCalledWith('place-detail-1');
    });

    it('details() degrades gracefully (not an error) when the place lookup fails', async () => {
      const competitor = await prisma.competitor.create({
        data: {
          businessId,
          name: 'Free Text Competitor',
          platformRef: 'Free Text Competitor',
        },
      });
      places.fetchPlaceDetails.mockResolvedValue(null);

      const result = await service.details(competitor.id);
      expect(result).toEqual({ hours: null, reviews: [], photos: [] });
    });
  });

  it('triggers a manual snapshot via the processor', async () => {
    const competitor = await prisma.competitor.create({
      data: { businessId, name: 'Trigger Test', platformRef: 'trigger-test' },
    });
    snapshotProcessor.snapshotOne.mockResolvedValue(undefined);

    await service.triggerSnapshot(competitor.id);

    expect(snapshotProcessor.snapshotOne).toHaveBeenCalledWith(
      competitor.id,
      'trigger-test',
    );
  });
});
