import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { buildRedisConnection } from '../common/queue/redis-connection.util';

const TTL_SECONDS = 60;

/**
 * Read-side cache for resolved entitlement sets (spec §6.3): Redis, `entitlement:{business_id}`,
 * 60s TTL, invalidated on every entitlement-affecting write. Redis is disposable (spec §7.3) — any
 * failure (not configured, unreachable, flushed) is a cache miss and the set is recomputed from
 * MySQL. Reservations never read from here; they read the authoritative counters.
 */
@Injectable()
export class EntitlementCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(EntitlementCacheService.name);
  private client: Redis | null = null;
  private disabled = false;

  constructor(private readonly config: ConfigService) {}

  private redis(): Redis | null {
    if (this.disabled) return null;
    if (this.client) return this.client;
    const configured =
      this.config.get<string>('REDIS_URL') ||
      this.config.get<string>('REDIS_HOST');
    if (!configured || process.env.NODE_ENV === 'test') {
      this.disabled = true;
      return null;
    }
    this.client = new Redis({
      ...buildRedisConnection(this.config),
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on('error', () => undefined);
    return this.client;
  }

  async get<T>(businessId: string): Promise<T | null> {
    const redis = this.redis();
    if (!redis || redis.status !== 'ready') return null;
    try {
      const raw = await redis.get(`entitlement:${businessId}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(businessId: string, value: unknown): Promise<void> {
    const redis = this.redis();
    if (!redis || redis.status !== 'ready') return;
    try {
      await redis.set(
        `entitlement:${businessId}`,
        JSON.stringify(value),
        'EX',
        TTL_SECONDS,
      );
    } catch (error) {
      this.logger.debug(`cache set failed: ${(error as Error).message}`);
    }
  }

  async invalidate(businessId: string): Promise<void> {
    const redis = this.redis();
    if (!redis || redis.status !== 'ready') return;
    try {
      await redis.del(`entitlement:${businessId}`);
    } catch {
      // A stale entry expires on its own within 60s; never fail the write for it.
    }
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }
}
