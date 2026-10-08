import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CreditModule } from '../credit/credit.module';
import { DigitizerModule } from '../digitizer/digitizer.module';
import { FINANCE_QUEUE } from './finance.constants';
import { FinanceController } from './finance.controller';
import { FinanceContextService } from './finance-context.service';
import { FinancePostingService } from './finance-posting.service';
import { FinanceSourcesService } from './finance-sources.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinanceJournalsService } from './finance-journals.service';
import { FinanceBankingService } from './finance-banking.service';
import { FinancePayablesService } from './finance-payables.service';
import { FinanceReceivablesService } from './finance-receivables.service';
import { FinanceTaxService } from './finance-tax.service';
import { FinanceAssetsService } from './finance-assets.service';
import { FinanceBudgetsService } from './finance-budgets.service';
import { FinanceFxService } from './finance-fx.service';
import { FinanceCloseService } from './finance-close.service';
import { FinanceSettingsService } from './finance-settings.service';
import { FinanceViewsService } from './finance-views.service';
import { FinanceRecordsService } from './finance-records.service';
import { FinanceDocsService } from './finance-docs.service';
import { FinanceJobsService } from './finance-jobs.service';
import { FinanceProcessor, FinanceScheduler } from './finance.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: FINANCE_QUEUE }),
    CreditModule,
    DigitizerModule,
  ],
  controllers: [FinanceController],
  providers: [
    FinanceContextService,
    FinancePostingService,
    FinanceSourcesService,
    FinanceLedgerService,
    FinanceJournalsService,
    FinanceBankingService,
    FinancePayablesService,
    FinanceReceivablesService,
    FinanceTaxService,
    FinanceAssetsService,
    FinanceBudgetsService,
    FinanceFxService,
    FinanceCloseService,
    FinanceSettingsService,
    FinanceViewsService,
    FinanceRecordsService,
    FinanceDocsService,
    FinanceJobsService,
    FinanceScheduler,
    FinanceProcessor,
  ],
  exports: [
    FinanceContextService,
    FinanceLedgerService,
    FinanceAssetsService,
    FinanceSourcesService,
  ],
})
export class FinanceModule {}
