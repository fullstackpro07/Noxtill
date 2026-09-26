import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Audit `entity` for every integration-related entry, so a connection's Audit tab is one query. */
export const INTEGRATION_AUDIT_ENTITY = 'Integration';

/**
 * Writes append-only `AuditLog` rows for integration actions with an *explicit* business and actor.
 * The OAuth callback runs with no authenticated request (the provider redirects the browser
 * straight to it), so the CLS-bound `AuditService` cannot attribute it — this helper can.
 */
@Injectable()
export class IntegrationAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    businessId: string;
    /** Catalog key or provider (`shopify`), `entityId` of the audit row. */
    key: string;
    action: string;
    actorUserId?: string | null;
    before?: unknown;
    after?: unknown;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        businessId: params.businessId,
        actorUserId: params.actorUserId ?? null,
        entity: INTEGRATION_AUDIT_ENTITY,
        entityId: params.key,
        action: params.action,
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
