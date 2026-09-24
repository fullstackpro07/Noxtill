import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateCompetitorDto } from './dto/create-competitor.dto';
import { UpdateCompetitorDto } from './dto/update-competitor.dto';
import { MARKETING_ERROR_CODES, MAX_COMPETITORS } from './marketing.constants';
import { CompetitorSnapshotProcessor } from './jobs/competitor-snapshot.processor';
import { MetaAdLibraryService, CompetitorAd } from './meta-ad-library.service';
import {
  GooglePlacesService,
  PlaceSearchResult,
} from './google-places.service';
import { S3Service } from '../common/storage/s3.service';
import { randomUUID } from 'crypto';
import { publicListingCompleteness } from './public-listing-completeness';

const HISTORY_WEEKS = 12;

/**
 * Competitor tracking (BE-063). Rating/review-count lookups go through the
 * real Google Places integration (GooglePlacesService) — see
 * CompetitorSnapshotProcessor for the weekly job and snapshotOne() for the
 * manual "refresh now" path this service also exposes. Capped at 5 per
 * business per spec.
 */
@Injectable()
export class CompetitorsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly snapshotProcessor: CompetitorSnapshotProcessor,
    private readonly adLibrary: MetaAdLibraryService,
    private readonly places: GooglePlacesService,
    private readonly s3: S3Service,
  ) {}

  /** Competitor add-flow fix (UPD-BE-128) — real search step ahead of `create()`. */
  search(query: string): Promise<PlaceSearchResult[]> {
    return this.places.searchPlaces(query);
  }

  /**
   * Competitor detail depth fix — real hours + up to 5 real reviews + up to 6 real photos, on
   * demand (not stored/refreshed on a schedule like rating). Photos are downloaded server-side and
   * re-uploaded to S3 (same pattern as `MediaLibraryService.generateImage()`'s AI-image handling)
   * so the Google Places API key is never sent to the client. Gracefully empty — not an error —
   * when the competitor's `platformRef` isn't a real Google Place ID (e.g. added via free-text) or
   * no `GOOGLE_PLACES_API_KEY` is configured.
   */
  async details(id: string) {
    const competitor = await this.tenantPrisma.client.competitor.findUnique({
      where: { id },
    });
    if (!competitor) {
      throw new NotFoundException('Competitor not found');
    }

    const details = await this.places.fetchPlaceDetails(competitor.platformRef);
    if (!details) {
      return {
        hours: null,
        reviews: [],
        photos: [],
        profile: null,
        completeness: null,
      };
    }

    const photos = (
      await Promise.all(
        details.photoReferences.map(async (ref) => {
          const photo = await this.places.fetchPhoto(ref);
          if (!photo) return null;
          const key = `competitor-photos/${id}/${randomUUID()}.jpg`;
          return this.s3.uploadAndSign(key, photo.buffer, photo.contentType);
        }),
      )
    ).filter((url): url is string => !!url);

    return {
      hours: details.hours,
      reviews: details.reviews,
      photos,
      profile: {
        website: details.website,
        phone: details.phone,
        address: details.address,
        categories: details.categories,
      },
      // Same seven public checks the business's own Master Record is scored on, so the two compare directly.
      completeness: publicListingCompleteness({
        name: true,
        phone: !!details.phone,
        website: !!details.website,
        address: !!details.address,
        hours: !!details.hours && details.hours.length > 0,
        category: details.categories.length > 0,
        photos: details.photoReferences.length > 0,
      }),
    };
  }

  list() {
    return this.tenantPrisma.client.competitor.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * "Category average" for the Reviews module's Competitor Ratings surface (UPD-FE-089) — there's
   * no external category-benchmark data source, so this is honestly derived from the business's
   * own tracked competitor set (which are, by definition of being manually added here, businesses
   * in the same category). Competitors with no rating yet (not snapshotted) are excluded rather
   * than counted as 0, which would drag the average down for reasons unrelated to real ratings.
   */
  async categoryAverage() {
    const competitors = await this.tenantPrisma.client.competitor.findMany({
      select: { lastRating: true, lastReviewsCount: true },
    });
    const rated = competitors.filter((c) => c.lastRating != null);
    const averageRating = rated.length
      ? rated.reduce((sum, c) => sum + Number(c.lastRating), 0) / rated.length
      : null;
    return {
      trackedCount: competitors.length,
      ratedCount: rated.length,
      averageRating:
        averageRating != null ? Math.round(averageRating * 10) / 10 : null,
    };
  }

  async create(businessId: string, dto: CreateCompetitorDto) {
    const count = await this.tenantPrisma.client.competitor.count();
    if (count >= MAX_COMPETITORS) {
      throw new AppException(
        MARKETING_ERROR_CODES.COMPETITOR_LIMIT_REACHED,
        `You can track at most ${MAX_COMPETITORS} competitors`,
        HttpStatus.FORBIDDEN,
      );
    }

    return this.tenantPrisma.client.competitor.create({
      data: {
        businessId,
        name: dto.name,
        platformRef: dto.platformRef,
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      },
    });
  }

  async update(id: string, dto: UpdateCompetitorDto) {
    const existing = await this.tenantPrisma.client.competitor.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Competitor not found');
    }
    return this.tenantPrisma.client.competitor.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.metaPageId !== undefined ? { metaPageId: dto.metaPageId } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        // An empty string clears the handle.
        ...(dto.instagramHandle !== undefined
          ? { instagramHandle: dto.instagramHandle || null }
          : {}),
      },
    });
  }

  /** Competitor Ads (UPD-BE-053) — empty (not an error) when no `metaPageId` has been set yet. */
  async ads(id: string): Promise<CompetitorAd[]> {
    const competitor = await this.tenantPrisma.client.competitor.findUnique({
      where: { id },
    });
    if (!competitor) {
      throw new NotFoundException('Competitor not found');
    }
    if (!competitor.metaPageId) {
      return [];
    }
    return this.adLibrary.fetchAds(competitor.metaPageId);
  }

  async remove(id: string) {
    const existing = await this.tenantPrisma.client.competitor.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Competitor not found');
    }
    await this.tenantPrisma.client.competitor.delete({ where: { id } });
    return { success: true };
  }

  /** Last 12 weekly snapshots, oldest first — feeds the frontend's rating sparkline. */
  async history(id: string) {
    const competitor = await this.tenantPrisma.client.competitor.findUnique({
      where: { id },
    });
    if (!competitor) {
      throw new NotFoundException('Competitor not found');
    }

    const snapshots =
      await this.tenantPrisma.client.competitorSnapshot.findMany({
        where: { competitorId: id },
        orderBy: { capturedAt: 'desc' },
        take: HISTORY_WEEKS,
      });

    return snapshots.reverse().map((s) => ({
      rating: Number(s.rating),
      reviewsCount: s.reviewsCount,
      capturedAt: s.capturedAt.toISOString(),
    }));
  }

  /** "Refresh now" — the weekly job does the same thing, this just runs it synchronously for one competitor on demand. */
  async triggerSnapshot(id: string) {
    const competitor = await this.tenantPrisma.client.competitor.findUnique({
      where: { id },
    });
    if (!competitor) {
      throw new NotFoundException('Competitor not found');
    }

    await this.snapshotProcessor.snapshotOne(
      competitor.id,
      competitor.platformRef,
    );
    return this.tenantPrisma.client.competitor.findUniqueOrThrow({
      where: { id },
    });
  }
}
