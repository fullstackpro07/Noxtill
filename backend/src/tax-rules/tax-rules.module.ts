import { Module } from '@nestjs/common';
import { TaxRulesController } from './tax-rules.controller';
import { TaxRulesService } from './tax-rules.service';

@Module({
  controllers: [TaxRulesController],
  providers: [TaxRulesService],
  exports: [TaxRulesService],
})
export class TaxRulesModule {}
