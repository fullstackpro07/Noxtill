import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GmbManagementService } from './gmb-management.service';
import { GMB_INSIGHTS_QUEUE } from './listings.constants';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';

/**
 * Nightly GMB insights pull (UPD-BE-042) — for every business with a connected `gmb` integration.
 * `GmbManagementService.pullInsights()` itself throws when `meta.locationId` isn't set (no
 * location-picker step exists yet), which is caught and logged per-business here so one
 * unconfigured business never blocks the rest, same convention as `LowStockScanProcessor`.
 */
@Processor(GMB_INSIGHTS_QUEUE)
export class GmbInsightsProcessor extends WorkerHost {
  private readonly logger = new Logger(GmbInsightsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmbManagement: GmbManagementService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const connectedGmb = await this.prisma.integration.findMany({
      where: {
        provider: IntegrationProvider.gmb,
        status: IntegrationStatus.connected,
      },
      select: { businessId: true },
    });

    for (const { businessId } of connectedGmb) {
      await this.gmbManagement
        .pullInsights(businessId)
        .catch((error: Error) =>
          this.logger.warn(
            `GMB insights pull failed for business ${businessId}: ${error.message}`,
          ),
        );
    }
  }
}
