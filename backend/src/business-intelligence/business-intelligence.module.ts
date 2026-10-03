import { Module } from '@nestjs/common';
import { WidgetsModule } from '../widgets/widgets.module';
import { BusinessIntelligenceController } from './business-intelligence.controller';
import { BusinessIntelligenceService } from './business-intelligence.service';

@Module({
  imports: [WidgetsModule],
  controllers: [BusinessIntelligenceController],
  providers: [BusinessIntelligenceService],
})
export class BusinessIntelligenceModule {}
