import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { RecurringExpensesScheduler } from './recurring-expenses.scheduler';
import { RecurringExpensesProcessor } from './recurring-expenses.processor';
import { RECURRING_EXPENSES_QUEUE } from './recurring-expenses.constants';
import { SpecialistAgentEventQueueModule } from '../common/agents/specialist-agent-event-queue.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: RECURRING_EXPENSES_QUEUE }),
    SpecialistAgentEventQueueModule,
  ],
  controllers: [ExpensesController],
  providers: [
    ExpensesService,
    RecurringExpensesScheduler,
    RecurringExpensesProcessor,
  ],
  exports: [ExpensesService],
})
export class ExpensesModule {}
