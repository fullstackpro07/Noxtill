import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { RECURRING_EXPENSES_QUEUE } from './recurring-expenses.constants';

@Processor(RECURRING_EXPENSES_QUEUE)
export class RecurringExpensesProcessor extends WorkerHost {
  private readonly logger = new Logger(RecurringExpensesProcessor.name);

  constructor(private readonly expensesService: ExpensesService) {
    super();
  }

  async process(): Promise<void> {
    const cloned = await this.expensesService.cloneRecurringExpenses();
    this.logger.debug(
      `Cloned ${cloned} recurring expense(s) for the new month`,
    );
  }
}
