import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { MetersService } from '../usage/meters.service';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGES_QUEUE } from './messaging.constants';
import { dlqName } from '../common/queue/queue.constants';
import { buildRedisConnection } from '../common/queue/redis-connection.util';

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
    @Optional() private readonly meters?: MetersService,
  ) {
    // An unlistened 'error' event on either queue's connection (e.g. Redis
    // over quota) throws and crashes the whole process, not just this listener.
    this.messagesQueue.on('error', (error: Error) =>
      this.logger.warn(`Messages queue connection error: ${error.message}`),
    );
    this.messagesDlq.on('error', (error: Error) =>
      this.logger.warn(`Messages DLQ connection error: ${error.message}`),
    );
  }

  onModuleInit() {
    this.events = new QueueEvents(MESSAGES_QUEUE, {
      connection: buildRedisConnection(this.config),
    });

    this.events.on('failed', ({ jobId, failedReason }) => {
      void this.moveToDlqIfExhausted(jobId, failedReason);
    });
    this.events.on('error', (error: Error) =>
      this.logger.warn(
        `Messages queue events connection error: ${error.message}`,
      ),
    );
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
    const message = await this.prisma.message
      .update({ where: { id: job.data.messageId }, data: { status: 'failed' } })
      .catch(() => null);
    // A failed operation is never charged: give back what the send gate set aside.
    if (message && this.meters) {
      const hold = await this.meters.findHold(
        message.businessId,
        `msg:${message.id}`,
      );
      if (hold) await this.meters.releaseHold(hold.id, 'send failed');
    }
  }

  async onModuleDestroy() {
    await this.events?.close();
  }
}
