import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CommerceModule } from '../commerce/commerce.module';
import { CustomersModule } from '../customers/customers.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProfitModule } from '../profit/profit.module';
import { ProcurementModule } from '../procurement/procurement.module';
import { SeoWorkspaceModule } from '../seo-workspace/seo-workspace.module';
import { SpecialistAgentOrchestrationController } from './specialist-agent-orchestration.controller';
import { SpecialistAgentOrchestrationProcessor } from './specialist-agent-orchestration.processor';
import { SpecialistAgentOrchestrationScheduler } from './specialist-agent-orchestration.scheduler';
import { SpecialistAgentOrchestrationService } from './specialist-agent-orchestration.service';
import { SpecialistAgentActionsController } from './specialist-agent-actions.controller';
import { SpecialistAgentActionsService } from './specialist-agent-actions.service';
import { SpecialistAgentDirectoryController } from './specialist-agent-directory.controller';
import { SpecialistAgentDirectoryService } from './specialist-agent-directory.service';
import { SpecialistAgentRunsController } from './specialist-agent-runs.controller';
import { SpecialistAgentRunsService } from './specialist-agent-runs.service';
import { SpecialistAgentRetentionService } from './specialist-agent-retention.service';
import { SPECIALIST_AGENT_ORCHESTRATION_QUEUE } from './specialist-agent-orchestration.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: SPECIALIST_AGENT_ORCHESTRATION_QUEUE }),
    AnalyticsModule,
    CommerceModule,
    CustomersModule,
    InventoryModule,
    ProfitModule,
    ProcurementModule,
    SeoWorkspaceModule,
  ],
  controllers: [
    SpecialistAgentOrchestrationController,
    SpecialistAgentActionsController,
    SpecialistAgentDirectoryController,
    SpecialistAgentRunsController,
  ],
  providers: [
    SpecialistAgentOrchestrationService,
    SpecialistAgentActionsService,
    SpecialistAgentDirectoryService,
    SpecialistAgentRunsService,
    SpecialistAgentRetentionService,
    SpecialistAgentOrchestrationProcessor,
    SpecialistAgentOrchestrationScheduler,
  ],
  exports: [SpecialistAgentOrchestrationService],
})
export class SpecialistAgentOrchestrationModule {}
