import { ConfigService } from '@nestjs/config';

/**
 * A request-metered Redis provider (e.g. Upstash) replies to a still-open connection with an
 * application-level error once its quota is used up, instead of dropping the socket — so
 * ioredis's normal reconnect backoff (`retryStrategy`) never engages, since that only fires on
 * an actual disconnect. Left alone, BullMQ's blocking job-fetch loop just resends the next
 * command immediately on that same connection, gets the same error, and resends again — a
 * zero-delay loop that burns through any quota (even a freshly reset one) in seconds and floods
 * logs. `reconnectOnError` is ioredis's built-in escape hatch for exactly this: force a real
 * reconnect on this specific error so it goes through `retryStrategy`'s capped backoff instead.
 */
function isQuotaExceededError(error: Error): boolean {
  return /max requests limit exceeded/i.test(error.message);
}

/** Shared ioredis connection-options builder — every BullMQ/QueueEvents connection in the app
 * must go through this so REDIS_URL support and the quota-exceeded circuit breaker apply
 * everywhere, not just wherever someone remembered to duplicate the env-var parsing. */
export function buildRedisConnection(config: ConfigService): object {
  const redisUrl = config.get<string>('REDIS_URL');

  const sharedOptions = {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    connectTimeout: 5000,
    reconnectOnError: (error: Error) => (isQuotaExceededError(error) ? 1 : false),
    retryStrategy: (times: number) => Math.min(times * 1000, 30000),
  };

  if (redisUrl) {
    // ── Full URL path (e.g. rediss://default:<password>@host:port) ──────────
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      ...sharedOptions,
    };
  }

  // ── Individual env vars path ─────────────────────────────────────────────
  // Supports: REDIS_HOST, REDIS_PORT, REDIS_USERNAME, REDIS_PASSWORD, REDIS_TLS
  const tlsRaw = config.get<string>('REDIS_TLS', '');
  const tlsEnabled = tlsRaw === 'true' || tlsRaw === '1' || tlsRaw === 'yes';

  return {
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: Number(config.get('REDIS_PORT', 6379)),
    username: config.get<string>('REDIS_USERNAME') || undefined,
    password: config.get<string>('REDIS_PASSWORD') || undefined,
    tls: tlsEnabled ? {} : undefined,
    ...sharedOptions,
  };
}
