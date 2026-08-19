import { Module } from '@nestjs/common';
import { ProfitService } from './profit.service';
import { ProfitController } from './profit.controller';
import { CashForecastService } from './cash-forecast.service';
import { RecurringObligationsService } from './recurring-obligations.service';
import { CashForecastController } from './cash-forecast.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [ProfitController, CashForecastController],
  providers: [ProfitService, CashForecastService, RecurringObligationsService],
  exports: [ProfitService],
})
export class ProfitModule {}
