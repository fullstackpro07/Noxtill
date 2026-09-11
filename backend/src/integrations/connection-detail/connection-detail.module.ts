import { Module } from '@nestjs/common';
import { ConnectionDetailService } from './connection-detail.service';
import { ConnectionDetailController } from './connection-detail.controller';
import { IntegrationsModule } from '../integrations.module';
import { AccountingModule } from '../accounting/accounting.module';
import { EcommerceModule } from '../ecommerce/ecommerce.module';
import { ListingsModule } from '../../listings/listings.module';
import { AdsModule } from '../../ads/ads.module';
import { AutomationModule } from '../automation/automation.module';

/**
 * Connection Detail (UPD-BE-132). Registered AFTER `IntegrationDirectoryModule` in
 * `app.module.ts` on purpose: this controller's `GET /integrations/:provider` is a dynamic
 * 2-segment route that would otherwise shadow the real static `GET /integrations/directory` if
 * Nest/Express tried to match it first — route registration order matters here.
 */
@Module({
  imports: [
    IntegrationsModule,
    AccountingModule,
    EcommerceModule,
    ListingsModule,
    AdsModule,
    AutomationModule,
  ],
  controllers: [ConnectionDetailController],
  providers: [ConnectionDetailService],
})
export class ConnectionDetailModule {}
