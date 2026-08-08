import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GooglePlacesService } from '../google-places.service';
import { COMPETITOR_SNAPSHOT_QUEUE } from '../marketing.constants';

/**
 * `competitor_snapshot` (BE-063): weekly refresh of each tracked competitor's rating/review count
 * via the real Google Places lookup, recording both the latest-snapshot columns on Competitor
 * itself and a permanent CompetitorSnapshot history row (what the 12-week sparkline reads from).
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

    for (const competitor of competitors) {
      await this.snapshotOne(competitor.id, competitor.platformRef);
    }

    this.logger.debug(
      `Competitor snapshot evaluated ${competitors.length} competitor(s)`,
    );
  }

  /** Shared by the weekly job and the "refresh now" manual-trigger endpoint. */
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
