import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations.module';
import { ConnectionDetailModule } from '../connection-detail/connection-detail.module';
import { HubController } from './hub.controller';
import { HubStateService } from './hub-state.service';
import { HubAdvisorService } from './hub-advisor.service';
import { HubConnectionService } from './hub-connection.service';
import { HubAccountingService } from './hub-accounting.service';
import { HubEcommerceService } from './hub-ecommerce.service';
import { HubAutomationService } from './hub-automation.service';
import { HubLineageService } from './hub-lineage.service';
import { HubRequestsService } from './hub-requests.service';

/**
 * Integrations hub (redesign) — the read model behind the seven Integrations tabs plus the
 * connection actions (pause / resume / sync now). Registered after `ConnectionDetailModule`.
 */
@Module({
  imports: [IntegrationsModule, ConnectionDetailModule],
  controllers: [HubController],
  providers: [
    HubStateService,
    HubAdvisorService,
    HubConnectionService,
    HubAccountingService,
    HubEcommerceService,
    HubAutomationService,
    HubLineageService,
    HubRequestsService,
  ],
  exports: [HubStateService],
})
export class IntegrationHubModule {}
