import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import type { Capability } from '../common/capabilities/capabilities.constants';
import {
  API_KEY_HOURLY_LIMIT,
  API_KEY_SUBJECT_PREFIX,
} from './api-key.constants';
import { Role } from '@prisma/client';

const HOUR_MS = 3_600_000;

/** 429 thrown when a key has used its hourly allowance; the guard turns `retryAfterSeconds` into the `Retry-After` header. */
export class ApiKeyRateLimitedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        code: 'API_KEY_RATE_LIMITED',
        message: `This API key has used its ${API_KEY_HOURLY_LIMIT.toLocaleString('en-US')} requests for this hour. Retry after ${retryAfterSeconds} seconds.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Real API-key authentication (UPD-BE-081) — the read side `JwtAuthGuard` calls for any
 * `Authorization: Bearer ntk_...` request, resolving straight to the same `AuthenticatedUser`
 * shape a JWT produces so every existing `@RequireCapability(...)` gate, and `TenancyGuard`'s CLS
 * binding, work unchanged for an API-key-authenticated request — no separate authorization path.
 * `role` is set to the lowest flat role (`staff`) since a key's real permissions are its `scopes`,
 * not a role; nothing in this codebase's capability checks reads `role` once `capabilities` is present.
 *
 * Integrations redesign: every authenticated request is counted in `ApiKeyUsageHour` (the Developer
 * tab's usage chart and per-key request counts), and a key over `API_KEY_HOURLY_LIMIT` for the
 * current hour is refused with a 429 rather than silently throttled.
 */
@Injectable()
export class ApiKeyAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async authenticate(rawKey: string): Promise<AuthenticatedUser | null> {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const row = await this.prisma.apiKey.findUnique({ where: { keyHash } });
    if (!row || row.revokedAt) return null;

    const bucketStart = new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
    const used = await this.countRequest(row.id, row.businessId, bucketStart);
    if (used > API_KEY_HOURLY_LIMIT) {
      const retryAfter = Math.max(
        1,
        Math.ceil((bucketStart.getTime() + HOUR_MS - Date.now()) / 1000),
      );
      throw new ApiKeyRateLimitedException(retryAfter);
    }

    void this.prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return {
      sub: `${API_KEY_SUBJECT_PREFIX}${row.id}`,
      businessId: row.businessId,
      role: Role.staff,
      capabilities: row.scopes as Capability[],
    };
  }

  /** Atomically bumps this key's counter for the hour and returns the new total. */
  private async countRequest(
    apiKeyId: string,
    businessId: string,
    bucketStart: Date,
  ): Promise<number> {
    const bump = () =>
      this.prisma.apiKeyUsageHour.upsert({
        where: { apiKeyId_bucketStart: { apiKeyId, bucketStart } },
        create: { apiKeyId, businessId, bucketStart, count: 1 },
        update: { count: { increment: 1 } },
        select: { count: true },
      });
    try {
      return (await bump()).count;
    } catch {
      // Two first-requests of the hour raced on the create — the row exists now, so bump it.
      return (await bump()).count;
    }
  }
}
