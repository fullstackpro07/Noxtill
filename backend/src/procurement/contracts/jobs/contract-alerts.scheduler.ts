import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PROCUREMENT_CONTRACT_ALERTS_QUEUE } from './contract-alerts.constants';

/** Supplier contract renewal alerts: once a day (08:00 UTC). */
@Injectable()
export class ProcurementContractAlertsScheduler implements OnModuleInit {
  private readonly logger = new Logger(ProcurementContractAlertsScheduler.name);

  constructor(
    @InjectQueue(PROCUREMENT_CONTRACT_ALERTS_QUEUE)
    private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 8 * * *' },
          jobId: 'procurement-contract-alerts-daily-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register contract alert tick: ${error.message}`,
        ),
      );
  }
}
