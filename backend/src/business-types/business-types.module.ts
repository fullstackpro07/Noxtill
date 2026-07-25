import { Module } from '@nestjs/common';
import { BusinessTypesSeedService } from './business-types-seed.service';
import { BusinessTypesService } from './business-types.service';
import { BusinessTypesController } from './business-types.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [BusinessTypesController],
  providers: [BusinessTypesSeedService, BusinessTypesService],
})
export class BusinessTypesModule {}
