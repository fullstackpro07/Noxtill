import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { ActivityPubSubService } from './activity-pubsub.service';

@Module({
  controllers: [ActivityController],
  providers: [ActivityService, ActivityPubSubService],
  exports: [ActivityService],
})
export class ActivityModule {}
