import { Module } from '@nestjs/common';
import { ProductRadarController } from './product-radar.controller';
import { ProductRadarService } from './product-radar.service';
import { ProductValidationController } from './product-validation.controller';
import { ProductValidationService } from './product-validation.service';
import { CommerceRfqsController } from './commerce-rfqs.controller';
import { CommerceRfqsService } from './commerce-rfqs.service';
import { CommerceSupplierClaimsController } from './commerce-supplier-claims.controller';
import { CommerceSupplierClaimsService } from './commerce-supplier-claims.service';
import { ActivityModule } from '../activity/activity.module';
import { AiModule } from '../ai/ai.module';
import { CommerceListingBuilderController } from './commerce-listing-builder.controller';
import { CommerceListingBuilderService } from './commerce-listing-builder.service';
import { CommerceChannelListingsService } from './commerce-channel-listings.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CommerceFulfillmentController } from './commerce-fulfillment.controller';
import { CommerceFulfillmentService } from './commerce-fulfillment.service';
import { CommerceFulfillmentRouterController } from './commerce-fulfillment-router.controller';
import { CommerceFulfillmentRouterService } from './commerce-fulfillment-router.service';
import { CommerceProductionController } from './commerce-production.controller';
import { CommerceProductionService } from './commerce-production.service';
import { CommerceRiskController } from './commerce-risk.controller';
import { CommerceRiskService } from './commerce-risk.service';
import { CommerceB2bController } from './commerce-b2b.controller';
import { CommerceB2bService } from './commerce-b2b.service';
import { CommerceSubscriptionsController } from './commerce-subscriptions.controller';
import { CommerceSubscriptionsService } from './commerce-subscriptions.service';
import { OrdersModule } from '../orders/orders.module';
import { CommerceStoreOptimizerController } from './commerce-store-optimizer.controller';
import { CommerceStoreOptimizerService } from './commerce-store-optimizer.service';
import { CommerceExperimentsController } from './commerce-experiments.controller';
import { CommerceExperimentsService } from './commerce-experiments.service';
import { CommerceAgentToolsController } from './commerce-agent-tools.controller';
import { CommerceAgentToolsService } from './commerce-agent-tools.service';

@Module({
  imports: [ActivityModule, AiModule, IntegrationsModule, OrdersModule],
  controllers: [
    ProductRadarController,
    ProductValidationController,
    CommerceRfqsController,
    CommerceSupplierClaimsController,
    CommerceListingBuilderController,
    CommerceFulfillmentController,
    CommerceFulfillmentRouterController,
    CommerceProductionController,
    CommerceRiskController,
    CommerceB2bController,
    CommerceSubscriptionsController,
    CommerceStoreOptimizerController,
    CommerceExperimentsController,
    CommerceAgentToolsController,
  ],
  providers: [
    ProductRadarService,
    ProductValidationService,
    CommerceRfqsService,
    CommerceSupplierClaimsService,
    CommerceListingBuilderService,
    CommerceChannelListingsService,
    CommerceFulfillmentService,
    CommerceFulfillmentRouterService,
    CommerceProductionService,
    CommerceRiskService,
    CommerceB2bService,
    CommerceSubscriptionsService,
    CommerceStoreOptimizerService,
    CommerceExperimentsService,
    CommerceAgentToolsService,
  ],
})
export class CommerceModule {}
