import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListingSyncService } from './listing-sync.service';
import { LISTINGS_AUTO_SYNC_QUEUE } from './listings.constants';

/**
 * Hourly auto-sync tick (UPD-BE-125) — for every business with `ListingSettings.autoSyncEnabled`,
 * runs the real `ListingSyncService.sync()` once its configured `autoSyncFrequencyHours` has
 * elapsed since `lastAutoSyncAt` (or it has never run). One business's failure (e.g. no Master
 * Listing set yet) is caught and logged, never blocking the rest — same convention as
 * `GmbInsightsProcessor`/`LowStockScanProcessor`.
 */
@Processor(LISTINGS_AUTO_SYNC_QUEUE)
export class ListingAutoSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ListingAutoSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly listingSync: ListingSyncService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const due = await this.prisma.listingSettings.findMany({
      where: { autoSyncEnabled: true },
    });

    const now = Date.now();
    for (const settings of due) {
      const elapsedHours = settings.lastAutoSyncAt
        ? (now - settings.lastAutoSyncAt.getTime()) / (60 * 60 * 1000)
        : Infinity;
      if (elapsedHours < settings.autoSyncFrequencyHours) continue;

      try {
        await this.listingSync.sync(settings.businessId);
      } catch (error) {
        this.logger.warn(
          `Auto-sync failed for business ${settings.businessId}: ${(error as Error).message}`,
        );
      }
      await this.prisma.listingSettings.update({
        where: { businessId: settings.businessId },
        data: { lastAutoSyncAt: new Date() },
      });
    }
  }
}
