import { Module } from '@nestjs/common';
import { ProfitService } from './profit.service';
import { ProfitController } from './profit.controller';

@Module({
  controllers: [ProfitController],
  providers: [ProfitService],
})
export class ProfitModule {}
