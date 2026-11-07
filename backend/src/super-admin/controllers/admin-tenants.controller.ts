import { Body, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SuperAdminController } from './super-admin-controller.decorator';
import {
  AdminTenantsService,
  type TenantListQuery,
} from '../services/admin-tenants.service';
import { AdminBillingService } from '../services/admin-billing.service';
import { AdminEntitlementsService } from '../services/admin-entitlements.service';
import { AdminMonitoringService } from '../services/admin-monitoring.service';
import {
  AdminPermission,
  AuditCtx,
  RequireReauth,
  type AdminAuditContext,
} from '../super-admin.decorators';
import {
  AssignPlanDto,
  BusinessStatusDto,
  CreditAdjustDto,
  ExtendTrialDto,
  ModuleTenantDto,
  NoteDto,
  OverrideDto,
  ReasonDto,
} from '../dto/super-admin.dto';
import type { PageQuery } from '../super-admin.util';

@SuperAdminController('tenants')
export class AdminTenantsController {
  constructor(
    private readonly tenants: AdminTenantsService,
    private readonly billing: AdminBillingService,
    private readonly ents: AdminEntitlementsService,
    private readonly monitoring: AdminMonitoringService,
  ) {}

  @AdminPermission('businesses.view')
  @Get()
  list(@Query() q: TenantListQuery) {
    return this.tenants.list(q);
  }

  @AdminPermission('businesses.view')
  @Get('countries')
  countries() {
    return this.tenants.countries();
  }

  @AdminPermission('businesses.view')
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.tenants.detail(id);
  }

  @AdminPermission('users.view')
  @Get(':id/users')
  users(@Param('id') id: string) {
    return this.tenants.users(id);
  }

  @AdminPermission('security.view')
  @Get(':id/security')
  security(@Param('id') id: string) {
    return this.tenants.security(id);
  }

  @AdminPermission('integrations.view')
  @Get(':id/integrations')
  integrations(@Param('id') id: string) {
    return this.tenants.integrations(id);
  }

  @AdminPermission('activity.view')
  @Get(':id/activity')
  activity(
    @Param('id') id: string,
    @Query()
    q: PageQuery & {
      source?: string;
      from?: string;
      to?: string;
      type?: string;
    },
  ) {
    return this.monitoring.activity({ ...q, businessId: id });
  }

  @AdminPermission('businesses.notes')
  @Get(':id/notes')
  notes(@Param('id') id: string) {
    return this.tenants.notes(id);
  }

  @AdminPermission('businesses.notes')
  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @Body() dto: NoteDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.tenants.addNote(id, dto.body, ctx);
  }

  @AdminPermission('businesses.suspend')
  @RequireReauth()
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: BusinessStatusDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.tenants.setStatus(id, dto.status, dto.reason, ctx);
  }

  @AdminPermission('sessions.manage')
  @RequireReauth()
  @Post(':id/sessions/revoke')
  revokeSessions(
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.tenants.revokeAllSessions(id, dto.reason, ctx);
  }

  // ------------------------------------------------------------ subscription

  @AdminPermission('subscriptions.view')
  @Get(':id/subscription')
  subscription(@Param('id') id: string) {
    return this.billing.tenantSubscription(id);
  }

  @AdminPermission('subscriptions.manage')
  @RequireReauth()
  @Post(':id/subscription/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignPlanDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.billing.assignPlan(
      id,
      dto.planKey,
      dto.interval,
      dto.reason,
      ctx,
    );
  }

  @AdminPermission('subscriptions.manage')
  @Post(':id/subscription/extend-trial')
  extendTrial(
    @Param('id') id: string,
    @Body() dto: ExtendTrialDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.billing.extendTrial(id, dto.days, dto.reason, ctx);
  }

  @AdminPermission('subscriptions.manage')
  @RequireReauth()
  @Post(':id/subscription/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.billing.cancel(id, dto.reason, ctx);
  }

  @AdminPermission('subscriptions.manage')
  @Post(':id/subscription/undo-cancel')
  undoCancel(
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.billing.undoCancel(id, dto.reason, ctx);
  }

  // ------------------------------------------------------------------ limits

  @AdminPermission('limits.view')
  @Get(':id/limits')
  limits(@Param('id') id: string) {
    return this.ents.limits(id);
  }

  @AdminPermission('limits.manage')
  @RequireReauth()
  @Post(':id/limits/overrides')
  createOverride(
    @Param('id') id: string,
    @Body() dto: OverrideDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.ents.createOverride(
      id,
      {
        metricCode: dto.metricCode,
        includedQuantity: dto.includedQuantity,
        effectiveFrom: dto.effectiveFrom,
        expiresAt: dto.expiresAt,
      },
      dto.reason,
      ctx,
    );
  }

  @AdminPermission('limits.manage')
  @RequireReauth()
  @Post(':id/limits/overrides/:overrideId/revoke')
  revokeOverride(
    @Param('id') id: string,
    @Param('overrideId') overrideId: string,
    @Body() dto: ReasonDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.ents.revokeOverride(id, overrideId, dto.reason, ctx);
  }

  // ----------------------------------------------------------------- modules

  @AdminPermission('modules.view')
  @Get(':id/modules')
  modules(@Param('id') id: string) {
    return this.ents.tenantModules(id);
  }

  @AdminPermission('modules.manage')
  @Patch(':id/modules/:key')
  setModule(
    @Param('id') id: string,
    @Param('key') key: string,
    @Body() dto: ModuleTenantDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.ents.setTenantModule(
      id,
      key,
      { state: dto.state, expiresAt: dto.expiresAt },
      dto.reason,
      ctx,
    );
  }

  // --------------------------------------------------------------------- AI

  @AdminPermission('ai.view')
  @Get(':id/ai/ledger')
  aiLedger(@Param('id') id: string, @Query() q: PageQuery) {
    return this.monitoring.aiLedger(id, q);
  }

  @AdminPermission('ai.manage')
  @RequireReauth()
  @Post(':id/ai/adjust')
  adjust(
    @Param('id') id: string,
    @Body() dto: CreditAdjustDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.monitoring.adjustCredits(id, dto.delta, dto.reason, ctx);
  }
}
