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
import {
  CreateCustomRoleDto,
  UpdateCustomRoleDto,
} from './dto/create-custom-role.dto';
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
  constructor(private readonly customRoles: CustomRolesService) {}

  @Get('capabilities')
  listCapabilities() {
    return ALL_CAPABILITIES;
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
