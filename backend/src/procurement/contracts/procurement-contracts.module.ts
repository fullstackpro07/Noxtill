import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ProcurementAnalyticsService } from './procurement-analytics.service';
import { ProcurementContractsController } from './procurement-contracts.controller';
import { ProcurementContractsService } from './procurement-contracts.service';
import { PROCUREMENT_CONTRACT_ALERTS_QUEUE } from './jobs/contract-alerts.constants';
import { ProcurementContractAlertsProcessor } from './jobs/contract-alerts.processor';
import { ProcurementContractAlertsScheduler } from './jobs/contract-alerts.scheduler';

/** Supplier Contracts & Terms and Procurement Analytics (kept separate from the requests module). */
@Module({
  imports: [
    NotificationsModule,
    BullModule.registerQueue({ name: PROCUREMENT_CONTRACT_ALERTS_QUEUE }),
  ],
  controllers: [ProcurementContractsController],
  providers: [
    ProcurementContractsService,
    ProcurementAnalyticsService,
    ProcurementContractAlertsScheduler,
    ProcurementContractAlertsProcessor,
  ],
})
export class ProcurementContractsModule {}
