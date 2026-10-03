import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { WorkflowApprovalsService } from './workflow-approvals.service';
import { CreditOverdueScanScheduler } from './jobs/credit-overdue-scan.scheduler';
import { CreditOverdueScanProcessor } from './jobs/credit-overdue-scan.processor';
import { WorkflowScheduleProcessor } from './jobs/workflow-schedule.processor';
import { WorkflowScheduleScheduler } from './jobs/workflow-schedule.scheduler';
import {
  CREDIT_OVERDUE_SCAN_QUEUE,
  WORKFLOW_SCHEDULE_QUEUE,
} from './workflows.constants';
import { MessagingModule } from '../../messaging/messaging.module';
import { AutomationModule as OutboundWebhookAutomationModule } from '../../integrations/automation/automation.module';
import { AiModule } from '../../ai/ai.module';
import { WorkflowDataMapperService } from './workflow-data-mapper.service';
import { WorkflowVariablesController } from './workflow-variables.controller';
import { WorkflowVariablesService } from './workflow-variables.service';
import { WorkflowDeadLettersController } from './workflow-dead-letters.controller';
import { WorkflowDeadLettersService } from './workflow-dead-letters.service';
import { AutomationCommandCenterController } from './automation-command-center.controller';
import { AutomationCommandCenterService } from './automation-command-center.service';
import {
  WorkflowEndpointsController,
  WorkflowHookReceiverController,
} from './workflow-endpoints.controller';
import { WorkflowEndpointsService } from './workflow-endpoints.service';
import { WorkflowRetentionScheduler } from './jobs/workflow-retention.scheduler';
import { WorkflowRetentionProcessor } from './jobs/workflow-retention.processor';
import { WORKFLOW_RETENTION_QUEUE } from './workflows.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: CREDIT_OVERDUE_SCAN_QUEUE },
      { name: WORKFLOW_SCHEDULE_QUEUE },
      { name: WORKFLOW_RETENTION_QUEUE },
    ),
    MessagingModule,
    OutboundWebhookAutomationModule,
    AiModule,
  ],
  controllers: [
    // Before WorkflowsController so its fixed path isn't captured by `workflows/:id`.
    AutomationCommandCenterController,
    WorkflowEndpointsController,
    WorkflowHookReceiverController,
    WorkflowsController,
    WorkflowVariablesController,
    WorkflowDeadLettersController,
  ],
  providers: [
    WorkflowsService,
    WorkflowTriggerService,
    WorkflowApprovalsService,
    WorkflowDataMapperService,
    WorkflowVariablesService,
    WorkflowDeadLettersService,
    AutomationCommandCenterService,
    WorkflowEndpointsService,
    CreditOverdueScanScheduler,
    CreditOverdueScanProcessor,
    WorkflowScheduleScheduler,
    WorkflowScheduleProcessor,
    WorkflowRetentionScheduler,
    WorkflowRetentionProcessor,
  ],
  exports: [WorkflowTriggerService],
})
export class AutomationsModule {}
