import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BusinessModulesController } from './business-modules.controller';
import { BusinessModuleGuard } from './business-module.guard';
import { BusinessModulesService } from './business-modules.service';

@Module({
  controllers: [BusinessModulesController],
  providers: [
    BusinessModulesService,
    { provide: APP_GUARD, useClass: BusinessModuleGuard },
  ],
  exports: [BusinessModulesService],
})
export class BusinessModulesModule {}
