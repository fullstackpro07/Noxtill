import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DEMO_QUEUE, dlqName } from './queue.constants';
import { QueueService } from './queue.service';
import { DemoProcessor } from './demo.processor';
import { DeadLetterListener } from './dead-letter.listener';

/**
 * Build an ioredis-compatible connection config from environment variables.
 *
 * Priority:
 *  1. REDIS_URL  — full URL (e.g. rediss://:<password>@host:port  from Upstash)
 *  2. REDIS_HOST + REDIS_PORT — explicit host/port pair
 *  3. Fallback: localhost:6379
 *
 * Socket timeouts are set so a missing/unreachable Redis instance fails fast
 * instead of blocking NestJS module init for 30+ seconds.
 */
function buildRedisConnection(config: ConfigService): object {
  const redisUrl = config.get<string>('REDIS_URL');

  if (redisUrl) {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      // Fail fast so the app still starts even if Redis is briefly unavailable
      connectTimeout: 5000,
      commandTimeout: 5000,
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    };
  }

  return {
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: Number(config.get('REDIS_PORT', 6379)),
    password: config.get<string>('REDIS_PASSWORD') || undefined,
    connectTimeout: 5000,
    commandTimeout: 5000,
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  };
}

@Global()
@Module({
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
})
export class QueueModule {}
