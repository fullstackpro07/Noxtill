import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import Redis from 'ioredis';

/**
 * Thin Redis pub/sub wrapper for the live activity feed (UPD-BE-002). Deliberately separate from
 * BullMQ's own managed connections (`common/queue/queue.module.ts`) — this is best-effort,
 * fire-and-forget live push, not a durable job queue, so it's configured to fail fast rather than
 * retry indefinitely: a business's activity history (the ActivityEvent table) is always the
 * source of truth regardless of whether Redis is reachable for the live-push layer on top.
 */
@Injectable()
export class ActivityPubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(ActivityPubSubService.name);
  private readonly publisher: Redis;

  constructor(config: ConfigService) {
    this.publisher = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(config.get('REDIS_PORT', 6379)),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    this.publisher.on('error', (error: Error) =>
      this.logger.warn(`Activity pub/sub connection error: ${error.message}`),
    );
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    try {
      await this.publisher.publish(channel, JSON.stringify(payload));
    } catch (error) {
      this.logger.warn(
        `Failed to publish activity event on ${channel}: ${(error as Error).message}`,
      );
    }
  }

  /** One dedicated subscriber connection per caller, cleaned up when the Observable is unsubscribed. */
  subscribe<T = unknown>(channel: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      const client = this.publisher.duplicate();
      client.on('error', (error: Error) =>
        this.logger.warn(
          `Activity subscriber error on ${channel}: ${error.message}`,
        ),
      );
      client.on('message', (messageChannel: string, message: string) => {
        if (messageChannel !== channel) return;
        try {
          subscriber.next(JSON.parse(message) as T);
        } catch (error) {
          this.logger.warn(
            `Malformed activity event on ${channel}: ${(error as Error).message}`,
          );
        }
      });
      client.subscribe(channel).catch((error: Error) => {
        this.logger.warn(`Failed to subscribe to ${channel}: ${error.message}`);
      });

      return () => {
        client.unsubscribe(channel).catch(() => undefined);
        client.quit().catch(() => undefined);
      };
    });
  }

  onModuleDestroy(): void {
    this.publisher.disconnect();
  }
}
