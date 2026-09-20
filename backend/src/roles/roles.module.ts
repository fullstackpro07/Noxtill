import { Module } from '@nestjs/common';
import { CustomRolesService } from './custom-roles.service';
import { SystemRoleOverridesService } from './system-role-overrides.service';
import { CustomRolesController } from './custom-roles.controller';

@Module({
  controllers: [CustomRolesController],
  providers: [CustomRolesService, SystemRoleOverridesService],
  exports: [SystemRoleOverridesService],
})
export class RolesModule {}
