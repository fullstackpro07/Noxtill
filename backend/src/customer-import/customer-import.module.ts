import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CustomerImportService } from './customer-import.service';
import { CustomerImportParser } from './customer-import.parser';
import { CustomerImportController } from './customer-import.controller';
import { CustomerImportProcessor } from './customer-import.processor';
import { CUSTOMER_IMPORT_QUEUE } from './customer-import.constants';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: CUSTOMER_IMPORT_QUEUE }),
    AiModule,
  ],
  controllers: [CustomerImportController],
  providers: [
    CustomerImportService,
    CustomerImportParser,
    CustomerImportProcessor,
  ],
})
export class CustomerImportModule {}
