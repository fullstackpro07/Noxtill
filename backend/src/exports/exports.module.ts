import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExportsService } from './exports.service';
import { ExportsController } from './exports.controller';
import { AccountZipProcessor } from './account-zip.processor';
import { EXPORTS_QUEUE } from './exports.constants';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [BullModule.registerQueue({ name: EXPORTS_QUEUE }), NotificationsModule],
  controllers: [ExportsController],
  providers: [ExportsService, AccountZipProcessor],
})
export class ExportsModule {}
