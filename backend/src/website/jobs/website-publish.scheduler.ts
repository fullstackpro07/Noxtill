import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WEBSITE_PUBLISH_QUEUE } from './website-publish.constants';

/** Website scheduled publishing: checks every 5 minutes for pages and posts whose time has come. */
@Injectable()
export class WebsitePublishScheduler implements OnModuleInit {
  private readonly logger = new Logger(WebsitePublishScheduler.name);

  constructor(
    @InjectQueue(WEBSITE_PUBLISH_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '*/5 * * * *' },
          jobId: 'website-scheduled-publish-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register website publish tick: ${error.message}`,
        ),
      );
  }
}
