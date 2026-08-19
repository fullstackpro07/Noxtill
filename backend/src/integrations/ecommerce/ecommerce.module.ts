import { Module } from '@nestjs/common';
import { EcommerceSyncService } from './ecommerce-sync.service';
import { EcommerceController } from './ecommerce.controller';
import { IntegrationsModule } from '../integrations.module';

@Module({
  imports: [IntegrationsModule],
  controllers: [EcommerceController],
  providers: [EcommerceSyncService],
})
export class EcommerceModule {}
