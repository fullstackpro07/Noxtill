import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GooglePlacesService } from '../google-places.service';
import { COMPETITOR_SNAPSHOT_QUEUE } from '../marketing.constants';
import { DEFAULT_COMPETITIVE_SETTINGS } from '../../competitive/competitive.constants';

const DAY_MS = 24 * 60 * 60 * 1000;
/** The daily tick fires at a fixed time, so a snapshot taken a few hours "early" still counts as due. */
const DUE_TOLERANCE_MS = 6 * 60 * 60 * 1000;

/**
 * `competitor_snapshot` (BE-063): refresh of each tracked competitor's rating/review count via the
 * real Google Places lookup, recording both the latest-snapshot columns on Competitor itself and a
 * permanent CompetitorSnapshot history row (what the rating sparkline reads from). Ticks daily; a
 * competitor is only refreshed once its business's `scanFrequencyDays` (Competitive Settings,
 * default 7) has elapsed since its last snapshot.
 */
@Processor(COMPETITOR_SNAPSHOT_QUEUE)
export class CompetitorSnapshotProcessor extends WorkerHost {
  private readonly logger = new Logger(CompetitorSnapshotProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googlePlaces: GooglePlacesService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    return this.runSnapshot();
  }

  async runSnapshot(): Promise<void> {
    const competitors = await this.prisma.competitor.findMany();
    const settings = await this.prisma.competitiveSettings.findMany({
      select: { businessId: true, scanFrequencyDays: true },
    });
    const frequencyByBusiness = new Map(
      settings.map((s) => [s.businessId, s.scanFrequencyDays]),
    );
    const now = Date.now();
    let refreshed = 0;

    for (const competitor of competitors) {
      const everyDays =
        frequencyByBusiness.get(competitor.businessId) ??
        DEFAULT_COMPETITIVE_SETTINGS.scanFrequencyDays;
      const last = await this.prisma.competitorSnapshot.findFirst({
        where: { competitorId: competitor.id },
        orderBy: { capturedAt: 'desc' },
        select: { capturedAt: true },
      });
      const due =
        !last ||
        now - last.capturedAt.getTime() >=
          everyDays * DAY_MS - DUE_TOLERANCE_MS;
      if (!due) continue;
      await this.snapshotOne(competitor.id, competitor.platformRef);
      refreshed += 1;
    }

    this.logger.debug(
      `Competitor snapshot evaluated ${competitors.length} competitor(s), refreshed ${refreshed}`,
    );
  }

  /** Shared by the scheduled job and the "refresh now" manual-trigger endpoint. */
  async snapshotOne(competitorId: string, platformRef: string): Promise<void> {
    const snapshot = await this.googlePlaces.fetchPlaceSnapshot(platformRef);
    if (!snapshot) return;

    await this.prisma.competitor.update({
      where: { id: competitorId },
      data: {
        lastRating: snapshot.rating,
        lastReviewsCount: snapshot.reviewsCount,
      },
    });
    await this.prisma.competitorSnapshot.create({
      data: {
        competitorId,
        rating: snapshot.rating,
        reviewsCount: snapshot.reviewsCount,
      },
    });
  }
}
