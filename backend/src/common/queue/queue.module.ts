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

  // retryStrategy: () => null  — stop retrying immediately on connection failure
  //                               (prevents infinite ETIMEDOUT loops)
  // lazyConnect: true           — don't open the TCP socket during module init;
  //                               connect only when the first Redis command is issued.
  //                               This lets NestJS reach app.listen() within Hostinger's
  //                               3-second startup window even if Redis is unreachable.
  const sharedOptions = {
    lazyConnect: true,
    retryStrategy: () => null,
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    connectTimeout: 5000,
  };

  if (redisUrl) {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      ...sharedOptions,
    };
  }

  return {
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: Number(config.get('REDIS_PORT', 6379)),
    password: config.get<string>('REDIS_PASSWORD') || undefined,
    ...sharedOptions,
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
