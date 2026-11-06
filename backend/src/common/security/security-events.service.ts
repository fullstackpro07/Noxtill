import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BASE_SEVERITY,
  FAILURE_TYPES,
  REPEATED_FAILURE_THRESHOLD,
  REPEATED_FAILURE_WINDOW_MIN,
  SEVERITY_RANK,
  SecurityEventType,
  SecuritySeverity,
} from './security-events.constants';

export interface SecurityEventInput {
  type: SecurityEventType;
  businessId?: string | null;
  userId?: string | null;
  adminId?: string | null;
  identifier?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Records authentication/access security events (Super Admin PRD §11.2) with the documented
 * severity rules in `security-events.constants.ts`. Cross-tenant by nature, so it uses
 * `PrismaService` with explicit ids.
 *
 * Never throws and never blocks the caller's real work: a login must not fail because the
 * security log had a problem. `record()` is awaited internally but errors are only logged.
 */
@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger(SecurityEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: SecurityEventInput): Promise<void> {
    try {
      const severity = await this.severityFor(input);
      await this.prisma.securityEvent.create({
        data: {
          type: input.type,
          severity,
          businessId: input.businessId ?? null,
          userId: input.userId ?? null,
          adminId: input.adminId ?? null,
          identifier: input.identifier?.slice(0, 191) ?? null,
          ipAddress: input.ipAddress?.slice(0, 64) ?? null,
          userAgent: input.userAgent ?? null,
          metadata: (input.metadata ?? undefined) as
            Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Security event ${input.type} not recorded: ${(error as Error).message}`,
      );
    }
  }

  /** Fire-and-forget variant for hot paths (guards). */
  emit(input: SecurityEventInput): void {
    void this.record(input);
  }

  /**
   * A login is from a "new device" when this user already has session history and none of it came
   * from this exact IP + user agent. A user's very first login is not flagged (nothing to compare).
   */
  async isNewDevice(
    userId: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ): Promise<boolean> {
    if (!ipAddress && !userAgent) return false;
    const [any, seen] = await Promise.all([
      this.prisma.session.count({ where: { userId } }),
      this.prisma.session.count({
        where: {
          userId,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
      }),
    ]);
    return any > 0 && seen === 0;
  }

  private async severityFor(
    input: SecurityEventInput,
  ): Promise<SecuritySeverity> {
    let severity = BASE_SEVERITY[input.type] ?? 'low';
    if (
      FAILURE_TYPES.includes(input.type) &&
      (input.identifier || input.ipAddress)
    ) {
      const since = new Date(Date.now() - REPEATED_FAILURE_WINDOW_MIN * 60_000);
      const or: Prisma.SecurityEventWhereInput[] = [];
      if (input.identifier) or.push({ identifier: input.identifier });
      if (input.ipAddress) or.push({ ipAddress: input.ipAddress });
      const recent = await this.prisma.securityEvent.count({
        where: {
          type: { in: FAILURE_TYPES },
          createdAt: { gte: since },
          OR: or,
        },
      });
      // +1 counts the event being recorded now.
      if (
        recent + 1 >= REPEATED_FAILURE_THRESHOLD &&
        SEVERITY_RANK[severity] < SEVERITY_RANK.high
      ) {
        severity = 'high';
      }
    }
    return severity;
  }
}
