import { Module } from '@nestjs/common';
import { CustomRolesService } from './custom-roles.service';
import { CustomRolesController } from './custom-roles.controller';

@Module({
  controllers: [CustomRolesController],
  providers: [CustomRolesService],
})
export class RolesModule {}
