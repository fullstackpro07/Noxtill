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

@Module({
  imports: [
    BullModule.registerQueue({ name: LOW_STOCK_SCAN_QUEUE }),
    MessagingModule,
    ActivityModule,
    AutomationsModule,
    OutboundWebhookAutomationModule,
    LocalizationModule,
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
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
