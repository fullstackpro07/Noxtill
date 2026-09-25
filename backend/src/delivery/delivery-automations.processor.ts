import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { DeliveryAutomationsService } from './delivery-automations.service';

export const DELIVERY_AUTOMATIONS_QUEUE = 'delivery-automations';

/** Registers the repeating tick that drives the time-based delivery automations. */
@Injectable()
export class DeliveryAutomationsScheduler implements OnModuleInit {
  private readonly logger = new Logger(DeliveryAutomationsScheduler.name);

  constructor(
    @InjectQueue(DELIVERY_AUTOMATIONS_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '*/2 * * * *' },
          jobId: 'delivery-automations-2min-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register delivery-automations tick: ${error.message}`,
        ),
      );
  }
}

/**
 * Every two minutes, runs the time-based rules (stale phone flag, ETA-slip message) for each
 * business that has at least one of them switched on. Cross-tenant by design (a background job
 * with no request), so each business runs inside its own tenant context.
 */
@Processor(DELIVERY_AUTOMATIONS_QUEUE)
export class DeliveryAutomationsProcessor extends WorkerHost {
  private readonly logger = new Logger(DeliveryAutomationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly automations: DeliveryAutomationsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    await this.runTick();
  }

  async runTick(): Promise<void> {
    const enabled = await this.prisma.deliverySettings.findMany({
      where: { OR: [{ autoFlagStalePhone: true }, { autoEtaOnSlip: true }] },
      select: { businessId: true },
    });
    for (const { businessId } of enabled) {
      try {
        await this.cls.run(async () => {
          this.cls.set(CLS_KEY_BUSINESS_ID, businessId);
          await this.automations.tick(businessId);
        });
      } catch (error) {
        this.logger.warn(
          `Delivery automations tick failed for ${businessId}: ${(error as Error).message}`,
        );
      }
    }
  }
}
