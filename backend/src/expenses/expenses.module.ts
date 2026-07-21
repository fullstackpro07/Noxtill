import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { RecurringExpensesScheduler } from './recurring-expenses.scheduler';
import { RecurringExpensesProcessor } from './recurring-expenses.processor';
import { RECURRING_EXPENSES_QUEUE } from './recurring-expenses.constants';

@Module({
  imports: [BullModule.registerQueue({ name: RECURRING_EXPENSES_QUEUE })],
  controllers: [ExpensesController],
  providers: [
    ExpensesService,
    RecurringExpensesScheduler,
    RecurringExpensesProcessor,
  ],
  exports: [ExpensesService],
})
export class ExpensesModule {}
