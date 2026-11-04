import { Module } from '@nestjs/common';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { CommerceModule } from '../commerce/commerce.module';
import { InventoryAgentHandoffController } from './inventory-agent-handoff.controller';

@Module({
  imports: [CommerceModule],
  controllers: [ProcurementController, InventoryAgentHandoffController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
