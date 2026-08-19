import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGES_QUEUE } from './messaging.constants';
import { dlqName } from '../common/queue/queue.constants';

interface SendJobData {
  messageId: string;
}

/**
 * Mirrors BE-010's DLQ pattern for the messages queue specifically: once a
 * send has exhausted all 5 attempts, land it on the dead-letter queue AND
 * flip the message to the owner-visible `failed` status (spec §3.1).
 */
@Injectable()
export class MessageDeadLetterListener
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MessageDeadLetterListener.name);
  private events?: QueueEvents;

  constructor(
    @InjectQueue(MESSAGES_QUEUE)
    private readonly messagesQueue: Queue<SendJobData>,
    @InjectQueue(dlqName(MESSAGES_QUEUE))
    private readonly messagesDlq: Queue<{
      originalJobId: string;
      data: SendJobData;
      failedReason: string;
    }>,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const tlsRaw = this.config.get<string>('REDIS_TLS', '');
    const tlsEnabled = tlsRaw === 'true' || tlsRaw === '1' || tlsRaw === 'yes';
    this.events = new QueueEvents(MESSAGES_QUEUE, {
      connection: {
        host: this.config.get<string>('REDIS_HOST', 'localhost'),
        port: Number(this.config.get('REDIS_PORT', 6379)),
        username: this.config.get<string>('REDIS_USERNAME') || undefined,
        password: this.config.get<string>('REDIS_PASSWORD') || undefined,
        tls: tlsEnabled ? {} : undefined,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
      },
    });

    this.events.on('failed', ({ jobId, failedReason }) => {
      void this.moveToDlqIfExhausted(jobId, failedReason);
    });
    // Do NOT await waitUntilReady() — blocks NestJS onModuleInit past Hostinger's
    // 3-second startup window. Events will start firing once connection is ready.
  }

  private async moveToDlqIfExhausted(
    jobId: string,
    failedReason: string,
  ): Promise<void> {
    const job = await this.messagesQueue.getJob(jobId);
    if (!job) return;

    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;

    this.logger.warn(
      `Message job ${jobId} exhausted ${maxAttempts} attempts (${failedReason}) — moving to DLQ`,
    );
    await this.messagesDlq.add(
      job.name,
      { originalJobId: jobId, data: job.data, failedReason },
      { jobId },
    );
    await this.prisma.message
      .update({ where: { id: job.data.messageId }, data: { status: 'failed' } })
      .catch(() => undefined);
  }

  async onModuleDestroy() {
    await this.events?.close();
  }
}
