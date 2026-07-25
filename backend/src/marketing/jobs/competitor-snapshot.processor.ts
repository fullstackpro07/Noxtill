import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { COMPETITOR_SNAPSHOT_QUEUE } from '../marketing.constants';

interface PlaceSnapshot {
  rating: number;
  reviewsCount: number;
}

/**
 * `competitor_snapshot` (BE-063): weekly refresh of each tracked competitor's
 * rating/review count. `fetchPlaceSnapshot` is stubbed pending the Google
 * Places/connector integration (BE-084, Module 18) — structurally correct,
 * a no-op until that lookup is wired in.
 */
@Processor(COMPETITOR_SNAPSHOT_QUEUE)
export class CompetitorSnapshotProcessor extends WorkerHost {
  private readonly logger = new Logger(CompetitorSnapshotProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    return this.runSnapshot();
  }

  async runSnapshot(): Promise<void> {
    const competitors = await this.prisma.competitor.findMany();

    for (const competitor of competitors) {
      const snapshot = await this.fetchPlaceSnapshot(competitor.platformRef);
      if (!snapshot) continue;

      await this.prisma.competitor.update({
        where: { id: competitor.id },
        data: {
          lastRating: snapshot.rating,
          lastReviewsCount: snapshot.reviewsCount,
        },
      });
    }

    this.logger.debug(
      `Competitor snapshot evaluated ${competitors.length} competitor(s)`,
    );
  }

  /** Stub pending BE-084's Google connector — returning null means "no update this cycle". */
  private fetchPlaceSnapshot(
    platformRef: string,
  ): Promise<PlaceSnapshot | null> {
    void platformRef;
    return Promise.resolve(null);
  }
}
