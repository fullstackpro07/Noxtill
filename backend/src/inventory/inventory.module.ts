import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { LowStockScanScheduler } from './low-stock-scan.scheduler';
import { LowStockScanProcessor } from './low-stock-scan.processor';
import { LOW_STOCK_SCAN_QUEUE } from './low-stock-scan.constants';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: LOW_STOCK_SCAN_QUEUE }),
    MessagingModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService, LowStockScanScheduler, LowStockScanProcessor],
  exports: [InventoryService],
})
export class InventoryModule {}
