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
}
