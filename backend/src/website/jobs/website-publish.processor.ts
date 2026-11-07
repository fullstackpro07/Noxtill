import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { WebsiteService } from '../website.service';
import { WEBSITE_PUBLISH_QUEUE } from './website-publish.constants';

@Processor(WEBSITE_PUBLISH_QUEUE)
export class WebsitePublishProcessor extends WorkerHost {
  private readonly logger = new Logger(WebsitePublishProcessor.name);

  constructor(private readonly website: WebsiteService) {
    super();
  }

  async process() {
    const results = await this.website.publishDueScheduled();
    const failed = results.filter((r) => !r.ok);
    if (failed.length)
      this.logger.warn(`${failed.length} scheduled website publish(es) failed`);
    return { published: results.length - failed.length, failed: failed.length };
  }
}
