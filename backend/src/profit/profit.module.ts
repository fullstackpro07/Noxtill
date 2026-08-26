import { Module } from '@nestjs/common';
import { ProfitService } from './profit.service';
import { ProfitController } from './profit.controller';
import { DeadHoursOfferService } from './dead-hours-offer.service';
import { CashForecastService } from './cash-forecast.service';
import { RecurringObligationsService } from './recurring-obligations.service';
import { CashForecastController } from './cash-forecast.controller';
import { AiModule } from '../ai/ai.module';
import { CustomersModule } from '../customers/customers.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [AiModule, CustomersModule, MessagingModule],
  controllers: [ProfitController, CashForecastController],
  providers: [
    ProfitService,
    DeadHoursOfferService,
    CashForecastService,
    RecurringObligationsService,
  ],
  exports: [ProfitService],
})
export class ProfitModule {}
