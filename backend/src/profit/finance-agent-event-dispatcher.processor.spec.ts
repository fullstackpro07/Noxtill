import { Job } from 'bullmq';
import {
  FINANCE_BUDGET_APPROVED_EVENT_JOB,
  FINANCE_EXPENSE_RECORDED_EVENT_JOB,
  FINANCE_JOURNAL_POSTED_EVENT_JOB,
  FINANCE_ORDER_COMPLETED_EVENT_JOB,
  FINANCE_RETURN_APPROVED_EVENT_JOB,
  FINANCE_STATEMENT_IMPORTED_EVENT_JOB,
} from '../common/agents/specialist-agent-events.constants';
import { FinanceAgentBudgetEventProcessor } from './finance-agent-budget-event.processor';
import { FinanceAgentEventDispatcherProcessor } from './finance-agent-event-dispatcher.processor';
import { FinanceAgentExpenseEventProcessor } from './finance-agent-expense-event.processor';
import { FinanceAgentJournalEventProcessor } from './finance-agent-journal-event.processor';
import { FinanceAgentOrderEventProcessor } from './finance-agent-order-event.processor';
import { FinanceAgentReturnEventProcessor } from './finance-agent-return-event.processor';
import { FinanceAgentStatementImportedEventProcessor } from './finance-agent-statement-imported-event.processor';

describe('FinanceAgentEventDispatcherProcessor', () => {
  const job = (name: string) => ({ name, data: {} }) as Job<unknown>;

  it.each([
    [FINANCE_EXPENSE_RECORDED_EVENT_JOB, 'expense'],
    [FINANCE_ORDER_COMPLETED_EVENT_JOB, 'order'],
    [FINANCE_RETURN_APPROVED_EVENT_JOB, 'returned'],
    [FINANCE_BUDGET_APPROVED_EVENT_JOB, 'budget'],
    [FINANCE_JOURNAL_POSTED_EVENT_JOB, 'journal'],
    [FINANCE_STATEMENT_IMPORTED_EVENT_JOB, 'statementImported'],
  ])('routes %s only to its matching handler', async (name, target) => {
    const handlers = {
      expense: { process: jest.fn().mockResolvedValue(undefined) },
      order: { process: jest.fn().mockResolvedValue(undefined) },
      returned: { process: jest.fn().mockResolvedValue(undefined) },
      budget: { process: jest.fn().mockResolvedValue(undefined) },
      journal: { process: jest.fn().mockResolvedValue(undefined) },
      statementImported: { process: jest.fn().mockResolvedValue(undefined) },
    };
    const dispatcher = new FinanceAgentEventDispatcherProcessor(
      handlers.expense as unknown as FinanceAgentExpenseEventProcessor,
      handlers.order as unknown as FinanceAgentOrderEventProcessor,
      handlers.returned as unknown as FinanceAgentReturnEventProcessor,
      handlers.budget as unknown as FinanceAgentBudgetEventProcessor,
      handlers.journal as unknown as FinanceAgentJournalEventProcessor,
      handlers.statementImported as unknown as FinanceAgentStatementImportedEventProcessor,
    );
    const event = job(name);

    await dispatcher.process(event);

    for (const [handlerName, handler] of Object.entries(handlers)) {
      if (handlerName === target) {
        expect(handler.process).toHaveBeenCalledWith(event);
      } else {
        expect(handler.process).not.toHaveBeenCalled();
      }
    }
  });

  it('fails an unknown Finance event instead of silently acknowledging it', async () => {
    const dispatcher = new FinanceAgentEventDispatcherProcessor(
      { process: jest.fn() } as unknown as FinanceAgentExpenseEventProcessor,
      { process: jest.fn() } as unknown as FinanceAgentOrderEventProcessor,
      { process: jest.fn() } as unknown as FinanceAgentReturnEventProcessor,
      { process: jest.fn() } as unknown as FinanceAgentBudgetEventProcessor,
      { process: jest.fn() } as unknown as FinanceAgentJournalEventProcessor,
      {
        process: jest.fn(),
      } as unknown as FinanceAgentStatementImportedEventProcessor,
    );

    await expect(
      dispatcher.process(job('unknown-finance-event')),
    ).rejects.toThrow(
      'Unsupported Finance specialist event job: unknown-finance-event',
    );
  });
});
