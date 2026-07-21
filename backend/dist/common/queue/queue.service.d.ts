import { Queue, JobsOptions } from 'bullmq';
import { DemoJobData, dlqName } from './queue.constants';
export declare class QueueService {
    private readonly demoQueue;
    constructor(demoQueue: Queue<DemoJobData, unknown, string>);
    addJob<T>(queue: Queue<T, unknown, string, T, unknown, string>, jobName: string, data: T, idempotencyKey: string, opts?: JobsOptions): Promise<import("bullmq").Job<T, unknown, string>>;
    addDemoJob(jobName: string, data: DemoJobData, idempotencyKey: string): Promise<import("bullmq").Job<DemoJobData, unknown, string>>;
    get demo(): Queue<DemoJobData, unknown, string, DemoJobData, unknown, string>;
}
export { dlqName };
