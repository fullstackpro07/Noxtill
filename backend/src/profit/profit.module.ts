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
import { FinancialIntelligenceService } from './financial-intelligence.service';
import { CreditModule } from '../credit/credit.module';
import { SpecialistAgentEventQueueModule } from '../common/agents/specialist-agent-event-queue.module';
import { FinanceAgentExpenseEventProcessor } from './finance-agent-expense-event.processor';
import { FinanceAgentOrderEventProcessor } from './finance-agent-order-event.processor';
import { FinanceAgentReturnEventProcessor } from './finance-agent-return-event.processor';
import { FinanceAgentBudgetEventProcessor } from './finance-agent-budget-event.processor';
import { FinanceAgentJournalEventProcessor } from './finance-agent-journal-event.processor';
import { FinanceAgentEventDispatcherProcessor } from './finance-agent-event-dispatcher.processor';
import { FinanceAgentStatementImportedEventProcessor } from './finance-agent-statement-imported-event.processor';
import { AccountingModule } from '../integrations/accounting/accounting.module';
import { FinanceBudgetsController } from './finance-budgets.controller';
import { FinanceBudgetsService } from './finance-budgets.service';
import { FinancePeriodCloseController } from './finance-period-close.controller';
import { FinancePeriodCloseService } from './finance-period-close.service';
import { FinanceJournalsController } from './finance-journals.controller';
import { FinanceJournalsService } from './finance-journals.service';
import { FinanceReconciliationController } from './finance-reconciliation.controller';
import { FinanceReconciliationService } from './finance-reconciliation.service';

@Module({
  imports: [
    AiModule,
    CustomersModule,
    MessagingModule,
    CreditModule,
    SpecialistAgentEventQueueModule,
    AccountingModule,
  ],
  controllers: [
    ProfitController,
    CashForecastController,
    FinanceBudgetsController,
    FinancePeriodCloseController,
    FinanceJournalsController,
    FinanceReconciliationController,
  ],
  providers: [
    ProfitService,
    DeadHoursOfferService,
    CashForecastService,
    RecurringObligationsService,
    FinancialIntelligenceService,
    FinanceAgentExpenseEventProcessor,
    FinanceAgentOrderEventProcessor,
    FinanceAgentReturnEventProcessor,
    FinanceAgentBudgetEventProcessor,
    FinanceAgentJournalEventProcessor,
    FinanceAgentStatementImportedEventProcessor,
    FinanceAgentEventDispatcherProcessor,
    FinanceBudgetsService,
    FinancePeriodCloseService,
    FinanceJournalsService,
    FinanceReconciliationService,
  ],
  exports: [
    ProfitService,
    FinancialIntelligenceService,
    FinanceJournalsService,
  ],
})
export class ProfitModule {}
