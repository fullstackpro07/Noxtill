import { Module } from '@nestjs/common';
import { VoiceCommandService } from './voice-command.service';
import { VoiceCommandController } from './voice-command.controller';
import { AiModule } from '../../ai/ai.module';
import { InventoryModule } from '../../inventory/inventory.module';
import { ExpensesModule } from '../../expenses/expenses.module';
import { CustomersModule } from '../../customers/customers.module';
import { CashRegisterModule } from '../../cash-register/cash-register.module';

@Module({
  imports: [
    AiModule,
    InventoryModule,
    ExpensesModule,
    CustomersModule,
    CashRegisterModule,
  ],
  controllers: [VoiceCommandController],
  providers: [VoiceCommandService],
})
export class VoiceCommandModule {}
