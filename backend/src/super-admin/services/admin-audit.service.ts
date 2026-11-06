import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/filters/app.exception';
import type { AdminAuditContext } from '../super-admin.decorators';
import { SUPER_ADMIN_ERROR_CODES } from '../super-admin.constants';

export interface AdminAuditEntry {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  businessId?: string | null;
  before?: unknown;
  after?: unknown;
  reason: string;
}

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Writes the append-only `platform_audit_logs` row for a privileged admin mutation (PRD §11.4).
 * Always called with the SAME transaction client as the mutation itself, so a change can never be
 * committed without its audit record (and a failed audit write rolls the change back).
 * UPDATE/DELETE on that table are refused by database triggers.
 */
@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** A reason is mandatory for every privileged change. */
  static requireReason(reason: unknown): string {
    const text = typeof reason === 'string' ? reason.trim() : '';
    if (text.length < 5) {
      throw new AppException(
        SUPER_ADMIN_ERROR_CODES.INVALID,
        'Give a reason for this change (at least 5 characters). It is kept in the audit log.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return text.slice(0, 2000);
  }

  async record(db: Db, ctx: AdminAuditContext, entry: AdminAuditEntry) {
    await db.platformAuditLog.create({
      data: {
        adminId: ctx.admin.id,
        adminEmail: ctx.admin.email,
        businessId: entry.businessId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        before: toJson(entry.before),
        after: toJson(entry.after),
        reason: AdminAuditService.requireReason(entry.reason),
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      },
    });
  }

  /** Convenience: run `fn` and its audit row (built from fn's result) in one transaction. */
  async run<T>(
    ctx: AdminAuditContext,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    entry: (result: T) => AdminAuditEntry,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const result = await fn(tx);
      await this.record(tx, ctx, entry(result));
      return result;
    });
  }
}

function toJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return JSON.parse(
    JSON.stringify(value, (_, v: unknown) =>
      typeof v === 'bigint' ? Number(v) : v,
    ),
  ) as Prisma.InputJsonValue;
}
