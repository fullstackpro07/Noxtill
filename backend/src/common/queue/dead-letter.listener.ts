import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
import {
  DeadLetterJobData,
  DemoJobData,
  DEMO_QUEUE,
  dlqName,
} from './queue.constants';

/**
 * Watches a queue for exhausted-retry failures and lands the job onto its
 * dead-letter queue (BE-010) so nothing is silently dropped after 5 attempts.
 */
@Injectable()
export class DeadLetterListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeadLetterListener.name);
  private events?: QueueEvents;

  constructor(
    @InjectQueue(DEMO_QUEUE) private readonly demoQueue: Queue<DemoJobData>,
    @InjectQueue(dlqName(DEMO_QUEUE))
    private readonly demoDlq: Queue<DeadLetterJobData>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.events = new QueueEvents(DEMO_QUEUE, {
      connection: {
        host: this.config.get<string>('REDIS_HOST', 'localhost'),
        port: Number(this.config.get('REDIS_PORT', 6379)),
      },
    });

    this.events.on('failed', ({ jobId, failedReason }) => {
      void this.moveToDlqIfExhausted(jobId, failedReason);
    });
  }

  private async moveToDlqIfExhausted(
    jobId: string,
    failedReason: string,
  ): Promise<void> {
    const job = await this.demoQueue.getJob(jobId);
    if (!job) return;

    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      this.logger.warn(
        `Job ${jobId} exhausted ${maxAttempts} attempts (${failedReason}) — moving to DLQ`,
      );
      await this.demoDlq.add(
        job.name,
        { originalJobId: jobId, data: job.data, failedReason },
        { jobId },
      );
    }
  }

  async onModuleDestroy() {
    await this.events?.close();
  }
}
