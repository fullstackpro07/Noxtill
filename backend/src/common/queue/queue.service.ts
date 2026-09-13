import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobsOptions } from 'bullmq';
import {
  DEFAULT_JOB_OPTIONS,
  DemoJobData,
  DEMO_QUEUE,
  dlqName,
} from './queue.constants';

/**
 * Thin wrapper enforcing the queue rule (BE-010 / spec §1): every job gets
 * the standard 5x exponential-backoff retry policy, and every job is given
 * an idempotency key as its BullMQ jobId so re-enqueueing the same logical
 * unit of work (e.g. a webhook retry, a duplicate API call) is a no-op while
 * the job is still pending/active.
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(DEMO_QUEUE)
    private readonly demoQueue: Queue<DemoJobData, unknown, string>,
  ) {
    // Queue is an EventEmitter — an unhandled 'error' (e.g. Redis over quota,
    // connection refused) throws and takes down the whole process, not just
    // this queue. Log it instead so a Redis outage never crashes the app.
    this.demoQueue.on('error', (error: Error) =>
      this.logger.warn(`Demo queue connection error: ${error.message}`),
    );
  }

  async addJob<T>(
    queue: Queue<T, unknown, string, T, unknown, string>,
    jobName: string,
    data: T,
    idempotencyKey: string,
    opts: JobsOptions = {},
  ) {
    return queue.add(jobName, data, {
      ...DEFAULT_JOB_OPTIONS,
      ...opts,
      jobId: idempotencyKey,
    });
  }

  async addDemoJob(
    jobName: string,
    data: DemoJobData,
    idempotencyKey: string,
    opts: JobsOptions = {},
  ) {
    return this.addJob(this.demoQueue, jobName, data, idempotencyKey, opts);
  }

  get demo() {
    return this.demoQueue;
  }
}

export { dlqName };
