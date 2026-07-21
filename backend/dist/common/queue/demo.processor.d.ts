import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DemoJobData } from './queue.constants';
export declare class DemoProcessor extends WorkerHost {
    process(job: Job<DemoJobData>): Promise<unknown>;
}
