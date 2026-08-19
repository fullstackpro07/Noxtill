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
import { ActivityModule } from '../activity/activity.module';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [ActivityModule, StorageModule],
  controllers: [
    RidersController,
    DeliveriesController,
    RoutesController,
    DeliveryZonesController,
  ],
  providers: [
    RidersService,
    DeliveriesService,
    DeliveryAssignmentService,
    RoutesService,
    RoutingService,
    DeliveryZonesService,
  ],
})
export class DeliveryModule {}
