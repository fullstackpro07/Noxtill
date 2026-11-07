import { Body, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SuperAdminController } from './super-admin-controller.decorator';
import {
  AdminUsersService,
  type UserListQuery,
} from '../services/admin-users.service';
import {
  AdminPermission,
  AuditCtx,
  type AdminAuditContext,
} from '../super-admin.decorators';
import {
  MembershipActiveDto,
  ReasonDto,
  RoleChangeDto,
  UserStatusDto,
} from '../dto/super-admin.dto';

@SuperAdminController('users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @AdminPermission('users.view')
  @Get()
  list(@Query() q: UserListQuery) {
    return this.users.list(q);
  }

  @AdminPermission('users.view')
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.users.detail(id);
  }

  @AdminPermission('users.manage')
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: UserStatusDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.users.setStatus(id, dto.status, dto.reason, ctx);
  }

  @AdminPermission('sessions.manage')
  @Post(':id/sessions/:sessionId/revoke')
  revokeOne(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: ReasonDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.users.revokeSession(id, sessionId, dto.reason, ctx);
  }

  @AdminPermission('sessions.manage')
  @Post(':id/sessions/revoke')
  revokeAll(
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.users.revokeAll(id, dto.reason, ctx);
  }

  @AdminPermission('users.manage')
  @Post(':id/password-reset')
  passwordReset(
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.users.sendPasswordReset(id, dto.reason, ctx);
  }

  @AdminPermission('users.manage')
  @Patch('memberships/:membershipId/role')
  changeRole(
    @Param('membershipId') membershipId: string,
    @Body() dto: RoleChangeDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.users.changeRole(membershipId, dto.role, dto.reason, ctx);
  }

  @AdminPermission('users.manage')
  @Patch('memberships/:membershipId/active')
  setActive(
    @Param('membershipId') membershipId: string,
    @Body() dto: MembershipActiveDto,
    @AuditCtx() ctx: AdminAuditContext,
  ) {
    return this.users.setMembershipActive(
      membershipId,
      dto.active,
      dto.reason,
      ctx,
    );
  }
}
