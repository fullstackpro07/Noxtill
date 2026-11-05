import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  FINANCE_BUDGET_APPROVED_EVENT_JOB,
  FINANCE_EXPENSE_RECORDED_EVENT_JOB,
  FINANCE_JOURNAL_POSTED_EVENT_JOB,
  FINANCE_ORDER_COMPLETED_EVENT_JOB,
  FINANCE_RETURN_APPROVED_EVENT_JOB,
  FINANCE_STATEMENT_IMPORTED_EVENT_JOB,
  SPECIALIST_AGENT_FINANCE_EVENTS_QUEUE,
} from '../common/agents/specialist-agent-events.constants';
import { FinanceAgentBudgetEventProcessor } from './finance-agent-budget-event.processor';
import { FinanceAgentExpenseEventProcessor } from './finance-agent-expense-event.processor';
import { FinanceAgentJournalEventProcessor } from './finance-agent-journal-event.processor';
import { FinanceAgentOrderEventProcessor } from './finance-agent-order-event.processor';
import { FinanceAgentReturnEventProcessor } from './finance-agent-return-event.processor';
import { FinanceAgentStatementImportedEventProcessor } from './finance-agent-statement-imported-event.processor';

/** One BullMQ worker routes Finance events so jobs cannot be consumed by the wrong handler. */
@Processor(SPECIALIST_AGENT_FINANCE_EVENTS_QUEUE)
@Injectable()
export class FinanceAgentEventDispatcherProcessor extends WorkerHost {
  constructor(
    private readonly expense: FinanceAgentExpenseEventProcessor,
    private readonly order: FinanceAgentOrderEventProcessor,
    private readonly returned: FinanceAgentReturnEventProcessor,
    private readonly budget: FinanceAgentBudgetEventProcessor,
    private readonly journal: FinanceAgentJournalEventProcessor,
    private readonly statementImported: FinanceAgentStatementImportedEventProcessor,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    switch (job.name) {
      case FINANCE_EXPENSE_RECORDED_EVENT_JOB:
        return this.expense.process(job);
      case FINANCE_ORDER_COMPLETED_EVENT_JOB:
        return this.order.process(job);
      case FINANCE_RETURN_APPROVED_EVENT_JOB:
        return this.returned.process(job);
      case FINANCE_BUDGET_APPROVED_EVENT_JOB:
        return this.budget.process(job);
      case FINANCE_JOURNAL_POSTED_EVENT_JOB:
        return this.journal.process(job);
      case FINANCE_STATEMENT_IMPORTED_EVENT_JOB:
        return this.statementImported.process(job);
      default:
        throw new Error(
          `Unsupported Finance specialist event job: ${job.name}`,
        );
    }
  }
}
