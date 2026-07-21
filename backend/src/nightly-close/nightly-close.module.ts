import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NightlyCloseService } from './nightly-close.service';
import { NightlyCloseScheduler } from './nightly-close.scheduler';
import { NightlyCloseProcessor } from './nightly-close.processor';
import { NightlyCloseController } from './nightly-close.controller';
import { MessagingModule } from '../messaging/messaging.module';
import { NIGHTLY_CLOSE_QUEUE } from './nightly-close.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: NIGHTLY_CLOSE_QUEUE }),
    MessagingModule,
  ],
  controllers: [NightlyCloseController],
  providers: [
    NightlyCloseService,
    NightlyCloseScheduler,
    NightlyCloseProcessor,
  ],
})
export class NightlyCloseModule {}
