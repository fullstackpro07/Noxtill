import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { CreditOverdueScanScheduler } from './jobs/credit-overdue-scan.scheduler';
import { CreditOverdueScanProcessor } from './jobs/credit-overdue-scan.processor';
import { CREDIT_OVERDUE_SCAN_QUEUE } from './workflows.constants';
import { MessagingModule } from '../../messaging/messaging.module';
import { AutomationModule as OutboundWebhookAutomationModule } from '../../integrations/automation/automation.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: CREDIT_OVERDUE_SCAN_QUEUE }),
    MessagingModule,
    OutboundWebhookAutomationModule,
  ],
  controllers: [WorkflowsController],
  providers: [
    WorkflowsService,
    WorkflowTriggerService,
    CreditOverdueScanScheduler,
    CreditOverdueScanProcessor,
  ],
  exports: [WorkflowTriggerService],
})
export class AutomationsModule {}
