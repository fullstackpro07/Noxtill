import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GOOGLE_SYNC_QUEUE } from './google-sync.constants';

@Injectable()
export class GoogleSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(GoogleSyncScheduler.name);

  constructor(@InjectQueue(GOOGLE_SYNC_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '*/30 * * * *' },
          jobId: 'google-sync-30min-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register google-sync tick: ${error.message}`,
        ),
      );
  }
}
