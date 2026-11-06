import {
  Body,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { SuperAdminController } from './super-admin-controller.decorator';
import { AdminBillingService } from '../services/admin-billing.service';
import { AdminEntitlementsService } from '../services/admin-entitlements.service';
import { AdminMonitoringService } from '../services/admin-monitoring.service';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import {
  AdminPermission,
  AuditCtx,
  RequireReauth,
  type AdminAuditContext,
} from '../super-admin.decorators';
import {
  ModuleGlobalDto,
  PlanDto,
  PlanEntitlementsDto,
} from '../dto/super-admin.dto';
import type { PageQuery } from '../super-admin.util';

type Range = { from?: string; to?: string };

@SuperAdminController('')
export class AdminPlatformController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly billing: AdminBillingService,
    private readonly ents: AdminEntitlementsService,
    private readonly monitoring: AdminMonitoringService,
  ) {}

  // -------------------------------------------------------------- dashboard

  @AdminPermission('dashboard.view')
  @Get('dashboard')
  summary(@Query() q: Range) {
    return this.dashboard.summary(q);
  }

  @AdminPermission('dashboard.view')
  @Get('dashboard/feed')
  feed() {
    return this.dashboard.feed();
  }

  // ------------------------------------------------------------------ plans

  @AdminPermission('plans.view')
  @Get('plans')
  plans() {
    return this.billing.plans();
  }

  @AdminPermission('plans.manage')
  @RequireReauth()
  @Post('plans')
  createPlan(@Body() dto: PlanDto, @AuditCtx() ctx: AdminAuditContext) {
    const { reason, totpCode: _t, ...input } = dto;
    return this.billing.createPlan(input, reason, ctx);
  }

  @AdminPermission('plans.manage')
  @RequireReauth()
  @Patch('plans/:key')
  updatePlan(
    @Param('key') key: string,
    @Body() dto: PlanDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    const { reason, totpCode: _t, key: _k, ...input } = dto;
    return this.billing.updatePlan(key, input, reason, ctx);
  }

  @AdminPermission('plans.manage')
  @RequireReauth()
  @Put('plans/:key/entitlements')
  setEntitlements(
    @Param('key') key: string,
    @Body() dto: PlanEntitlementsDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.billing.setEntitlements(key, dto.entitlements, dto.reason, ctx);
  }

  // ---------------------------------------------------------- subscriptions

  @AdminPermission('subscriptions.view')
  @Get('subscriptions')
  subscriptions(
    @Query()
    q: PageQuery & {
      status?: string;
      plan?: string;
      interval?: string;
      search?: string;
    },
  ) {
    return this.billing.subscriptionList(q);
  }

  // ---------------------------------------------------------------- modules

  @AdminPermission('modules.view')
  @Get('modules')
  modules() {
    return this.ents.registry();
  }

  @AdminPermission('modules.manage')
  @RequireReauth()
  @Patch('modules/:key')
  setGlobal(
    @Param('key') key: string,
    @Body() dto: ModuleGlobalDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.ents.setGlobal(key, dto.disabled, dto.reason, ctx);
  }

  // ------------------------------------------------------------------ usage

  @AdminPermission('limits.view')
  @Get('usage')
  usage(@Query() q: Range & { businessId?: string; metric?: string }) {
    return this.monitoring.usageOverview(q);
  }

  @AdminPermission('limits.view')
  @Get('usage/records')
  usageRecords(
    @Query()
    q: PageQuery &
      Range & {
        businessId?: string;
        metric?: string;
        status?: string;
        userId?: string;
      },
  ) {
    return this.monitoring.usageRecords(q);
  }

  @AdminPermission('ai.view')
  @Get('ai')
  ai(@Query() q: Range & { businessId?: string }) {
    return this.monitoring.ai(q);
  }

  @AdminPermission('ai.view')
  @Get('ai/balances')
  aiBalances(@Query() q: PageQuery & { search?: string }) {
    return this.monitoring.aiBalances(q);
  }

  @AdminPermission('communications.view')
  @Get('communications')
  communications(
    @Query() q: Range & { businessId?: string; channel?: string },
  ) {
    return this.monitoring.communications(q);
  }

  // --------------------------------------------------------------- activity

  @AdminPermission('activity.view')
  @Get('activities')
  activities(
    @Query()
    q: PageQuery &
      Range & {
        source?: string;
        businessId?: string;
        userId?: string;
        type?: string;
        search?: string;
      },
  ) {
    return this.monitoring.activity(q);
  }

  @AdminPermission('activity.export')
  @Get('activities/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="noxtill-activity.csv"')
  exportActivities(
    @Query()
    q: Range & {
      source?: string;
      businessId?: string;
      userId?: string;
      type?: string;
      search?: string;
    },
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.monitoring.activityCsv(q, ctx);
  }

  // --------------------------------------------------------------- security

  @AdminPermission('security.view')
  @Get('security')
  security(@Query() q: Range) {
    return this.monitoring.securityOverview(q);
  }

  @AdminPermission('security.view')
  @Get('security/events')
  securityEvents(
    @Query()
    q: PageQuery &
      Range & {
        type?: string;
        severity?: string;
        businessId?: string;
        userId?: string;
        ip?: string;
        search?: string;
      },
  ) {
    return this.monitoring.securityEvents(q);
  }

  @AdminPermission('security.view')
  @Get('sessions')
  sessions(
    @Query()
    q: PageQuery & { businessId?: string; userId?: string; search?: string },
  ) {
    return this.monitoring.sessions(q);
  }

  // ----------------------------------------------------------- integrations

  @AdminPermission('integrations.view')
  @Get('integrations')
  integrations(
    @Query()
    q: PageQuery & { provider?: string; status?: string; businessId?: string },
  ) {
    return this.monitoring.integrations(q);
  }
}
