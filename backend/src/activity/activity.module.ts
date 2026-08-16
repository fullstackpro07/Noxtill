import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { ActivityPubSubService } from './activity-pubsub.service';
import { AutomationsModule } from '../marketing/automations/automations.module';

@Module({
  imports: [AutomationsModule],
  controllers: [ActivityController],
  providers: [ActivityService, ActivityPubSubService],
  exports: [ActivityService],
})
export class ActivityModule {}
