import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../tenancy/tenant.constants';

export interface AuditLogParams {
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}

export interface AuditLogQuery {
  entity?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

/**
 * Append-only audit trail (BE-009). Every financial mutation (sale, payment,
 * credit entry, refund, delete, import batch, export) must call this. The
 * underlying table has UPDATE/DELETE revoked at the DB role level (see the
 * BE-005 migration), so this is genuinely insert-only.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
  ) {}

  async log(params: AuditLogParams): Promise<void> {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    if (!businessId) {
      // No tenant bound to this async context — nothing to attribute the entry to.
      return;
    }
    const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);

    await this.tenantPrisma.client.auditLog.create({
      data: {
        businessId,
        actorUserId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        before:
          params.before === undefined
            ? undefined
            : (params.before as Prisma.InputJsonValue),
        after:
          params.after === undefined
            ? undefined
            : (params.after as Prisma.InputJsonValue),
      },
    });
  }

  /** Activity Log (UPD-BE-079) — real query/filter over the append-only audit trail `log()` writes. */
  async list(businessId: string, query: AuditLogQuery = {}) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 200) : 50;

    const where: Prisma.AuditLogWhereInput = {
      businessId,
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.tenantPrisma.client.auditLog.count({ where }),
      this.tenantPrisma.client.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { total, page, pageSize, rows };
  }
}
