import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityEventsService } from '../../common/security/security-events.service';

/** Auth security spec §10.1 — per account and per IP. Windows are fixed (start-aligned). */
export const AUTH_LIMITS = {
  otpRequestAccount: { max: 5, windowMs: 3_600_000 },
  otpRequestIp: { max: 20, windowMs: 3_600_000 },
  otpVerifyIp: { max: 30, windowMs: 3_600_000 },
  loginAccount: { max: 10, windowMs: 3_600_000 },
  loginIp: { max: 30, windowMs: 3_600_000 },
  resetAccount: { max: 3, windowMs: 3_600_000 },
  resetIp: { max: 10, windowMs: 3_600_000 },
  oauthCallbackIp: { max: 60, windowMs: 3_600_000 },
  passkeyAccount: { max: 20, windowMs: 3_600_000 },
  passkeyIp: { max: 60, windowMs: 3_600_000 },
  refreshAccount: { max: 60, windowMs: 3_600_000 },
} as const;
export type AuthLimitName = keyof typeof AUTH_LIMITS;

/** Spike thresholds per minute across all accounts (global floor → alert, §10.1). */
const SPIKE_PER_MINUTE: Partial<Record<AuthLimitName, number>> = {
  otpRequestIp: 300,
  otpVerifyIp: 300,
  loginIp: 600,
};

export class RateLimitedException extends HttpException {
  constructor(public readonly retryAfterSeconds: number) {
    super(
      {
        code: 'RATE_LIMITED',
        message: `Too many attempts. Try again in ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minute(s).`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * DB-backed fixed-window counters (works across instances). Keys hash the account identifier so an
 * email never sits in the table in clear. `hit()` throws a 429 carrying Retry-After; the HTTP filter
 * turns `retryAfterSeconds` into the header.
 */
@Injectable()
export class AuthRateLimitService {
  private readonly logger = new Logger(AuthRateLimitService.name);
  private lastSpikeAlert = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly securityEvents?: SecurityEventsService,
  ) {}

  static key(limit: AuthLimitName, subject: string): string {
    return `${limit}:${createHash('sha256').update(subject.toLowerCase()).digest('hex').slice(0, 40)}`;
  }

  /** Counts one attempt and throws RateLimitedException once the window is exhausted. */
  async hit(
    limit: AuthLimitName,
    subject: string | undefined | null,
  ): Promise<void> {
    if (!subject) return;
    const { max, windowMs } = AUTH_LIMITS[limit];
    const key = AuthRateLimitService.key(limit, subject);
    const now = Date.now();
    const windowStart = new Date(now - (now % windowMs));
    // Atomic upsert: reset the counter when a new window starts, otherwise increment.
    await this.prisma.$executeRaw`
      INSERT INTO auth_rate_buckets (\`key\`, window_start, count) VALUES (${key}, ${windowStart}, 1)
      ON DUPLICATE KEY UPDATE
        count = IF(window_start = VALUES(window_start), count + 1, 1),
        window_start = VALUES(window_start)`;
    const row = await this.prisma.authRateBucket.findUnique({ where: { key } });
    const count = Number(row?.count ?? 1);
    await this.checkSpike(limit);
    if (count > max) {
      const retryAfter = Math.ceil(
        (windowStart.getTime() + windowMs - now) / 1000,
      );
      throw new RateLimitedException(retryAfter);
    }
  }

  /** Clears an account counter after a successful step (e.g. password sign-in succeeded). */
  async reset(
    limit: AuthLimitName,
    subject: string | undefined | null,
  ): Promise<void> {
    if (!subject) return;
    await this.prisma.authRateBucket
      .delete({ where: { key: AuthRateLimitService.key(limit, subject) } })
      .catch(() => undefined);
  }

  private async checkSpike(limit: AuthLimitName) {
    const threshold = SPIKE_PER_MINUTE[limit];
    if (!threshold) return;
    const minute = Math.floor(Date.now() / 60_000);
    const key = `spike:${limit}:${minute}`;
    await this.prisma.$executeRaw`
      INSERT INTO auth_rate_buckets (\`key\`, window_start, count) VALUES (${key}, NOW(3), 1)
      ON DUPLICATE KEY UPDATE count = count + 1`;
    const row = await this.prisma.authRateBucket.findUnique({ where: { key } });
    if (
      Number(row?.count ?? 0) === threshold &&
      this.lastSpikeAlert.get(limit) !== minute
    ) {
      this.lastSpikeAlert.set(limit, minute);
      this.logger.warn(
        `Auth traffic spike on ${limit}: ${threshold}+ attempts this minute`,
      );
      await this.securityEvents?.record({
        type: 'auth_spike_detected',
        metadata: { limit, perMinute: threshold },
      });
    }
  }
}
