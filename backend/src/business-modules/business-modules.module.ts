import { Module } from '@nestjs/common';
import { BusinessModulesController } from './business-modules.controller';
import { BusinessModulesService } from './business-modules.service';

@Module({
  controllers: [BusinessModulesController],
  providers: [BusinessModulesService],
  exports: [BusinessModulesService],
})
export class BusinessModulesModule {}
