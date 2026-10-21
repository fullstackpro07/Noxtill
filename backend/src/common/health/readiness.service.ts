import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { buildRedisConnection } from '../queue/redis-connection.util';

type CheckStatus = 'ok' | 'failed' | 'not_configured';

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

/**
 * Readiness for external probes / load balancers: the database and Redis must answer within a
 * short timeout. Liveness stays the cheap `/health`. No tenant data or error details are exposed.
 */
@Injectable()
export class ReadinessService implements OnModuleDestroy {
  private redis?: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async check() {
    const [database, redis] = await Promise.all([
      this.database(),
      this.redisStatus(),
    ]);
    // Without Redis the app runs with queues disabled (see QueueModule), so it is reported, not fatal.
    const ready = database === 'ok' && redis !== 'failed';
    return {
      status: ready ? 'ready' : 'not_ready',
      checks: { database, redis },
      timestamp: new Date().toISOString(),
    };
  }

  private async database(): Promise<CheckStatus> {
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, 2000);
      return 'ok';
    } catch {
      return 'failed';
    }
  }

  private async redisStatus(): Promise<CheckStatus> {
    if (
      !this.config.get<string>('REDIS_URL') &&
      !this.config.get<string>('REDIS_HOST')
    ) {
      return 'not_configured';
    }
    try {
      this.redis ??= new Redis({
        ...buildRedisConnection(this.config),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        // A probe must never keep reconnecting on its own; each check decides afresh.
        retryStrategy: () => null,
      });
      // Failures are reported through the check result; never as an unhandled 'error' event.
      this.redis.on('error', () => undefined);
      if (this.redis.status === 'wait') {
        await withTimeout(this.redis.connect(), 2000);
      }
      const pong = await withTimeout(this.redis.ping(), 2000);
      return pong === 'PONG' ? 'ok' : 'failed';
    } catch {
      this.redis?.disconnect();
      this.redis = undefined;
      return 'failed';
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }
}
