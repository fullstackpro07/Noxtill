import { Module } from '@nestjs/common';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { CommerceModule } from '../commerce/commerce.module';
import { FinanceModule } from '../finance/finance.module';
import { ProcurementBudgetsService } from './procurement-budgets.service';

@Module({
  imports: [CommerceModule, FinanceModule],
  controllers: [ProcurementController],
  providers: [ProcurementService, ProcurementBudgetsService],
  exports: [ProcurementService, ProcurementBudgetsService],
})
export class ProcurementModule {}
