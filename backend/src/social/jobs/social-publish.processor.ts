import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { SocialPostsService } from '../social-posts.service';
import { SOCIAL_PUBLISH_QUEUE } from '../social.constants';

interface PublishJobData {
  businessId: string;
  postId: string;
}

/** On-demand publish job (UPD-BE-046) — same shape as `CustomerImportProcessor`: the processor just delegates, the real per-target loop lives in `SocialPostsService.executePublish`. */
@Processor(SOCIAL_PUBLISH_QUEUE)
export class SocialPublishProcessor extends WorkerHost {
  private readonly logger = new Logger(SocialPublishProcessor.name);

  constructor(private readonly posts: SocialPostsService) {
    super();
  }

  async process(job: Job<PublishJobData>): Promise<void> {
    await this.posts.executePublish(job.data.businessId, job.data.postId);
    this.logger.debug(`Social post ${job.data.postId} publish executed`);
  }
}
