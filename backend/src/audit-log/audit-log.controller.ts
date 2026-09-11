import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

/** Activity Log (UPD-BE-079) — a thin query surface over the existing append-only `AuditLog` model, no new model needed. */
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditService: AuditService) {}

  @RequireCapability(CAPABILITIES.ACTIVITY_LOG_VIEW)
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryAuditLogDto,
  ) {
    return this.auditService.list(user.businessId, {
      entity: query.entity,
      entityId: query.entityId,
      actorUserId: query.actorUserId,
      action: query.action,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
