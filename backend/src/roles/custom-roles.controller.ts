import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CustomRolesService } from './custom-roles.service';
import { SystemRoleOverridesService } from './system-role-overrides.service';
import {
  CreateCustomRoleDto,
  UpdateCustomRoleDto,
} from './dto/create-custom-role.dto';
import { UpdateSystemRoleCapabilitiesDto } from './dto/update-system-role-capabilities.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  ALL_CAPABILITIES,
  CAPABILITIES,
} from '../common/capabilities/capabilities.constants';

/** Managing the permission structure itself is owner-only — see `SYSTEM_ROLE_CAPABILITIES`. */
@Controller()
@RequireCapability(CAPABILITIES.ROLES_MANAGE)
export class CustomRolesController {
  constructor(
    private readonly customRoles: CustomRolesService,
    private readonly systemRoleOverrides: SystemRoleOverridesService,
  ) {}

  @Get('capabilities')
  listCapabilities() {
    return ALL_CAPABILITIES;
  }

  /**
   * Staff module v2 — Roles & Permissions (UPD-BE-STAFF-01). Declared before `roles/:id` below so
   * the literal `system` segment is matched first, not swallowed by the `:id` param route.
   */
  @Get('roles/system')
  listSystemRoles(@CurrentUser() user: AuthenticatedUser) {
    return this.systemRoleOverrides.list(user.businessId);
  }

  @Patch('roles/system/:role')
  updateSystemRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('role') role: string,
    @Body() dto: UpdateSystemRoleCapabilitiesDto,
  ) {
    return this.systemRoleOverrides.update(
      user.businessId,
      role,
      dto.capabilities,
    );
  }

  @Delete('roles/system/:role')
  resetSystemRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('role') role: string,
  ) {
    return this.systemRoleOverrides.reset(user.businessId, role);
  }

  @Post('roles')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomRoleDto,
  ) {
    return this.customRoles.create(user.businessId, dto);
  }

  @Get('roles')
  list() {
    return this.customRoles.list();
  }

  @Get('roles/:id')
  findOne(@Param('id') id: string) {
    return this.customRoles.findOne(id);
  }

  @Patch('roles/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomRoleDto) {
    return this.customRoles.update(id, dto);
  }

  @Delete('roles/:id')
  remove(@Param('id') id: string) {
    return this.customRoles.remove(id);
  }
}
