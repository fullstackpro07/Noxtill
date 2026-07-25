import { Module } from '@nestjs/common';
import { RollupService } from './rollup.service';
import { BranchAdvisorService } from './branch-advisor.service';
import { BranchesController } from './branches.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [BranchesController],
  providers: [RollupService, BranchAdvisorService],
  exports: [RollupService],
})
export class BranchesModule {}
