import { Module } from '@nestjs/common';
import { AccountingMappingService } from './accounting-mapping.service';
import { AccountingSyncService } from './accounting-sync.service';
import { AccountingController } from './accounting.controller';
import { IntegrationsModule } from '../integrations.module';

@Module({
  imports: [IntegrationsModule],
  controllers: [AccountingController],
  providers: [AccountingMappingService, AccountingSyncService],
})
export class AccountingModule {}
