import { Module } from '@nestjs/common';
import { AccountingMappingService } from './accounting-mapping.service';
import { AccountingSyncService } from './accounting-sync.service';
import { XeroOpenItemsService } from './xero-open-items.service';
import { XeroBankTransactionStatusService } from './xero-bank-transaction-status.service';
import { AccountingController } from './accounting.controller';
import { IntegrationsModule } from '../integrations.module';

@Module({
  imports: [IntegrationsModule],
  controllers: [AccountingController],
  providers: [
    AccountingMappingService,
    AccountingSyncService,
    XeroOpenItemsService,
    XeroBankTransactionStatusService,
  ],
  exports: [
    AccountingMappingService,
    AccountingSyncService,
    XeroOpenItemsService,
    XeroBankTransactionStatusService,
  ],
})
export class AccountingModule {}
