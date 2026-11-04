import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { InventoryService } from './inventory.service';
import { StockCountService } from './stock-count.service';
import { ReorderSuggestionsService } from './reorder-suggestions.service';
import { ProductWaitlistService } from './product-waitlist.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { InventoryController } from './inventory.controller';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { LowStockScanScheduler } from './low-stock-scan.scheduler';
import { LowStockScanProcessor } from './low-stock-scan.processor';
import { LOW_STOCK_SCAN_QUEUE } from './low-stock-scan.constants';
import { MessagingModule } from '../messaging/messaging.module';
import { ActivityModule } from '../activity/activity.module';
import { AutomationsModule } from '../marketing/automations/automations.module';
import { AutomationModule as OutboundWebhookAutomationModule } from '../integrations/automation/automation.module';
import { LocalizationModule } from '../common/localization/localization.module';
import { AiModule } from '../ai/ai.module';
import { InventoryIntelligenceService } from './inventory-intelligence.service';
import { BranchesModule } from '../branches/branches.module';
import { SpecialistAgentEventQueueModule } from '../common/agents/specialist-agent-event-queue.module';
import { InventoryAgentEventProcessor } from './inventory-agent-event.processor';
import { INVENTORY_AGENT_OUTCOMES_QUEUE } from './inventory-agent-outcomes.constants';
import { InventoryAgentOutcomesScheduler } from './inventory-agent-outcomes.scheduler';
import { InventoryAgentOutcomesProcessor } from './inventory-agent-outcomes.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: LOW_STOCK_SCAN_QUEUE },
      { name: INVENTORY_AGENT_OUTCOMES_QUEUE },
    ),
    MessagingModule,
    ActivityModule,
    AutomationsModule,
    OutboundWebhookAutomationModule,
    LocalizationModule,
    AiModule,
    BranchesModule,
    SpecialistAgentEventQueueModule,
  ],
  controllers: [InventoryController, PurchaseOrdersController],
  providers: [
    InventoryService,
    StockCountService,
    ReorderSuggestionsService,
    ProductWaitlistService,
    PurchaseOrdersService,
    LowStockScanScheduler,
    LowStockScanProcessor,
    InventoryIntelligenceService,
    InventoryAgentEventProcessor,
    InventoryAgentOutcomesScheduler,
    InventoryAgentOutcomesProcessor,
  ],
  exports: [InventoryService, InventoryIntelligenceService],
})
export class InventoryModule {}
