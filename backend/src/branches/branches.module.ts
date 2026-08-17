import { Module } from '@nestjs/common';
import { RollupService } from './rollup.service';
import { BranchAdvisorService } from './branch-advisor.service';
import { BranchManagementService } from './branch-management.service';
import { BranchesController } from './branches.controller';
import { StockTransfersService } from './stock-transfers.service';
import { StockTransfersController } from './stock-transfers.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [BranchesController, StockTransfersController],
  providers: [
    RollupService,
    BranchAdvisorService,
    BranchManagementService,
    StockTransfersService,
  ],
  exports: [RollupService],
})
export class BranchesModule {}
