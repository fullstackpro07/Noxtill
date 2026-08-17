import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SocialPostsService } from '../social-posts.service';
interface PublishJobData {
    businessId: string;
    postId: string;
}
export declare class SocialPublishProcessor extends WorkerHost {
    private readonly posts;
    private readonly logger;
    constructor(posts: SocialPostsService);
    process(job: Job<PublishJobData>): Promise<void>;
}
export {};
