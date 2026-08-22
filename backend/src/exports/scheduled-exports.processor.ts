import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ScheduledExportsService } from './scheduled-exports.service';
import { SCHEDULED_EXPORTS_QUEUE } from './scheduled-exports.constants';

@Processor(SCHEDULED_EXPORTS_QUEUE)
export class ScheduledExportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledExportsProcessor.name);

  constructor(private readonly scheduledExports: ScheduledExportsService) {
    super();
  }

  async process(): Promise<void> {
    const ran = await this.scheduledExports.runDueSchedules();
    this.logger.debug(`Ran ${ran} due scheduled export(s)`);
  }
}
