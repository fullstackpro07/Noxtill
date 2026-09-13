import {
  DynamicModule,
  Global,
  Injectable,
  Logger,
  Module,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { Queue, JobsOptions } from 'bullmq';
import { DemoJobData, DEMO_QUEUE, dlqName } from './queue.constants';
import { QueueService } from './queue.service';
import { DemoProcessor } from './demo.processor';
import { DeadLetterListener } from './dead-letter.listener';
import { buildRedisConnection } from './redis-connection.util';

export { QueueService, dlqName };

// ---------------------------------------------------------------------------
// No-op stub — used when Redis is not configured.
// Satisfies the QueueService injection token without opening any connections.
// ---------------------------------------------------------------------------
@Injectable()
class NoOpQueueService {
  private readonly logger = new Logger('QueueService');

  private warn() {
    this.logger.warn(
      'Redis is not configured (REDIS_URL / REDIS_HOST missing). ' +
        'Queue operations are disabled.',
    );
  }

  addJob<T>(
    _queue: unknown,
    _jobName: string,
    _data: T,
    _idempotencyKey: string,
    _opts?: JobsOptions,
  ): Promise<null> {
    this.warn();
    return Promise.resolve(null);
  }

  addDemoJob(
    _jobName: string,
    _data: DemoJobData,
    _idempotencyKey: string,
    _opts?: JobsOptions,
  ): Promise<null> {
    this.warn();
    return Promise.resolve(null);
  }

  get demo(): Queue | null {
    return null;
  }
}

// ---------------------------------------------------------------------------
// QueueModule — returns a DynamicModule with or without BullMQ depending on
// whether Redis is configured in the environment.
// ---------------------------------------------------------------------------
@Global()
@Module({})
export class QueueModule {
  static forRoot(): DynamicModule {
    const redisAvailable = !!(process.env.REDIS_URL || process.env.REDIS_HOST);

    if (!redisAvailable) {
      // ── No Redis configured: return a zero-connection stub ──────────────
      return {
        module: QueueModule,
        global: true,
        providers: [
          {
            provide: QueueService,
            useClass: NoOpQueueService,
          },
        ],
        exports: [QueueService],
      };
    }

    // ── Redis is configured: load the full BullMQ stack ──────────────────
    return {
      module: QueueModule,
      global: true,
      imports: [
        BullModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            connection: buildRedisConnection(config),
          }),
        }),
        BullModule.registerQueue(
          { name: DEMO_QUEUE },
          { name: dlqName(DEMO_QUEUE) },
        ),
      ],
      providers: [QueueService, DemoProcessor, DeadLetterListener],
      exports: [QueueService, BullModule],
    };
  }
}
