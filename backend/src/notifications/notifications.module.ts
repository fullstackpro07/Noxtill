import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import {
  NotificationsController,
  NotificationPreferencesController,
} from './notifications.controller';

@Module({
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
