import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateCompetitorDto } from './dto/create-competitor.dto';
import { UpdateCompetitorDto } from './dto/update-competitor.dto';
import { MARKETING_ERROR_CODES, MAX_COMPETITORS } from './marketing.constants';
import { CompetitorSnapshotProcessor } from './jobs/competitor-snapshot.processor';
import { MetaAdLibraryService, CompetitorAd } from './meta-ad-library.service';

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
  ) {}

  list() {
    return this.tenantPrisma.client.competitor.findMany({
      orderBy: { createdAt: 'asc' },
    });
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
        platformRef: dto.platformRef,
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
      data: { metaPageId: dto.metaPageId },
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
