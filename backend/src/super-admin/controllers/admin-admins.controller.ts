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
import { AdminAdminsService } from '../services/admin-admins.service';
import {
  AdminPermission,
  AuditCtx,
  RequireReauth,
  type AdminAuditContext,
} from '../super-admin.decorators';
import {
  AdminRoleDto,
  CreateAdminDto,
  ReasonDto,
  UpdateAdminDto,
} from '../dto/super-admin.dto';
import type { PageQuery } from '../super-admin.util';

type AuditQuery = PageQuery & {
  adminId?: string;
  businessId?: string;
  action?: string;
  resourceType?: string;
  from?: string;
  to?: string;
};

@SuperAdminController('admins')
export class AdminAdminsController {
  constructor(private readonly admins: AdminAdminsService) {}

  @AdminPermission('admins.manage')
  @Get()
  list() {
    return this.admins.list();
  }

  @AdminPermission('admins.manage')
  @RequireReauth()
  @Post()
  create(@Body() dto: CreateAdminDto, @AuditCtx() ctx: AdminAuditContext) {
    return this.admins.create(
      { email: dto.email, name: dto.name, roleKey: dto.roleKey },
      dto.reason,
      ctx,
    );
  }

  @AdminPermission('admins.manage')
  @RequireReauth()
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.admins.update(
      id,
      { roleKey: dto.roleKey, status: dto.status, name: dto.name },
      dto.reason,
      ctx,
    );
  }

  @AdminPermission('admins.manage')
  @RequireReauth()
  @Post(':id/reset-mfa')
  resetMfa(
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.admins.resetMfa(id, dto.reason, ctx);
  }

  @AdminPermission('admins.manage')
  @RequireReauth()
  @Post(':id/reset-password')
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.admins.resetPassword(id, dto.reason, ctx);
  }

  @AdminPermission('admins.manage')
  @Get(':id/sessions')
  sessions(@Param('id') id: string) {
    return this.admins.sessions(id);
  }

  @AdminPermission('admins.manage')
  @Post(':id/sessions/revoke')
  revokeSessions(
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.admins.revokeSessions(id, dto.reason, ctx);
  }

  @AdminPermission('admins.manage')
  @Get('roles/all')
  roles() {
    return this.admins.roles();
  }

  @AdminPermission('admins.manage')
  @RequireReauth()
  @Put('roles/:key')
  saveRole(
    @Param('key') key: string,
    @Body() dto: AdminRoleDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.admins.saveRole(
      key,
      {
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions,
      },
      dto.reason,
      ctx,
    );
  }

  @AdminPermission('audit.view')
  @Get('audit/log')
  audit(@Query() q: AuditQuery) {
    return this.admins.auditLog(q);
  }

  @AdminPermission('audit.view')
  @Get('audit/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="noxtill-admin-audit.csv"',
  )
  exportAudit(@Query() q: AuditQuery, @AuditCtx() ctx: AdminAuditContext) {
    return this.admins.auditCsv(q, ctx);
  }
}
