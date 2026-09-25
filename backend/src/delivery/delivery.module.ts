import { Module } from '@nestjs/common';
import { RidersService } from './riders.service';
import { RidersController } from './riders.controller';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesController } from './deliveries.controller';
import { DeliveryAssignmentService } from './delivery-assignment.service';
import { RoutesService } from './routes.service';
import { RoutesController } from './routes.controller';
import { RoutingService } from './routing.service';
import { DeliveryZonesService } from './delivery-zones.service';
import { DeliveryZonesController } from './delivery-zones.controller';
import { DeliverySettingsService } from './delivery-settings.service';
import { DeliverySettingsController } from './delivery-settings.controller';
import { DeliveryOverviewService } from './delivery-overview.service';
import { DeliveryOverviewController } from './delivery-overview.controller';
import { DeliveryInsightsService } from './delivery-insights.service';
import { DeliveryInsightsController } from './delivery-insights.controller';
import { DeliveryPricingService } from './delivery-pricing.service';
import { DeliveryNotifierService } from './delivery-notifier.service';
import { DeliveryAutomationsService } from './delivery-automations.service';
import {
  DELIVERY_AUTOMATIONS_QUEUE,
  DeliveryAutomationsProcessor,
  DeliveryAutomationsScheduler,
} from './delivery-automations.processor';
import { GeocodingService } from './geocoding.service';
import { PublicTrackingService } from './public-tracking.service';
import { PublicTrackingController } from './public-tracking.controller';
import { BullModule } from '@nestjs/bullmq';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityModule } from '../activity/activity.module';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [
    ActivityModule,
    StorageModule,
    MessagingModule,
    NotificationsModule,
    BullModule.registerQueue({ name: DELIVERY_AUTOMATIONS_QUEUE }),
  ],
  controllers: [
    RidersController,
    DeliveriesController,
    RoutesController,
    DeliveryZonesController,
    DeliverySettingsController,
    DeliveryOverviewController,
    DeliveryInsightsController,
    PublicTrackingController,
  ],
  providers: [
    RidersService,
    DeliveriesService,
    DeliveryAssignmentService,
    RoutesService,
    RoutingService,
    DeliveryZonesService,
    DeliverySettingsService,
    DeliveryOverviewService,
    DeliveryInsightsService,
    DeliveryPricingService,
    DeliveryNotifierService,
    DeliveryAutomationsService,
    DeliveryAutomationsProcessor,
    DeliveryAutomationsScheduler,
    GeocodingService,
    PublicTrackingService,
  ],
  exports: [DeliveryPricingService],
})
export class DeliveryModule {}
