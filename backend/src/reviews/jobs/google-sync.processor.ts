import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GOOGLE_SYNC_QUEUE } from './google-sync.constants';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';

interface GmbFetchedReview {
  externalId: string;
  author?: string;
  stars: number;
  text?: string;
}

/**
 * `google_sync` (BE-049): every 30 min, pull new reviews for each business
 * with a connected `gmb` integration and push any queued replies. The actual
 * GMB API calls are stubbed pending the OAuth connector (BE-084, Module 18)
 * — `fetchReviews`/`pushReply` are the two seams that connector will fill
 * in; until then this job is structurally correct but a no-op (no business
 * has a connected gmb integration yet).
 */
@Processor(GOOGLE_SYNC_QUEUE)
export class GoogleSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(GoogleSyncProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    return this.runSync();
  }

  async runSync(): Promise<void> {
    const integrations = await this.prisma.integration.findMany({
      where: {
        provider: IntegrationProvider.gmb,
        status: IntegrationStatus.connected,
      },
    });

    for (const integration of integrations) {
      const reviews = await this.fetchReviews(integration.businessId);
      for (const review of reviews) {
        await this.prisma.externalReview.upsert({
          where: {
            businessId_platform_externalId: {
              businessId: integration.businessId,
              platform: 'gmb',
              externalId: review.externalId,
            },
          },
          create: {
            businessId: integration.businessId,
            platform: 'gmb',
            externalId: review.externalId,
            author: review.author,
            stars: review.stars,
            text: review.text,
          },
          update: {
            author: review.author,
            stars: review.stars,
            text: review.text,
          },
        });
      }

      const queuedReplies = await this.prisma.externalReview.findMany({
        where: {
          businessId: integration.businessId,
          platform: 'gmb',
          replyText: { not: null },
          repliedAt: null,
        },
      });
      for (const review of queuedReplies) {
        await this.pushReply(
          integration.businessId,
          review.externalId,
          review.replyText!,
        );
        await this.prisma.externalReview.update({
          where: { id: review.id },
          data: { repliedAt: new Date() },
        });
      }
    }

    this.logger.debug(
      `Google sync evaluated ${integrations.length} connected business(es)`,
    );
  }

  /** Stub pending BE-084's GMB OAuth connector — params are the future call signature. */
  private fetchReviews(businessId: string): Promise<GmbFetchedReview[]> {
    void businessId;
    return Promise.resolve([]);
  }

  /** Stub pending BE-084's GMB OAuth connector — params are the future call signature. */
  private pushReply(
    businessId: string,
    externalId: string,
    replyText: string,
  ): Promise<void> {
    void businessId;
    void externalId;
    void replyText;
    return Promise.resolve();
  }
}
