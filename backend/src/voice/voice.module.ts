import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TelephonyService } from './telephony.service';
import { VoiceCallService } from './voice-call.service';
import { VoiceQueryService } from './voice-query.service';
import { MissedCallService } from './missed-call.service';
import { VoiceController } from './voice.controller';
import { VoiceRetentionScheduler } from './jobs/voice-retention.scheduler';
import { VoiceRetentionProcessor } from './jobs/voice-retention.processor';
import { VOICE_RETENTION_QUEUE } from './voice.constants';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../common/storage/storage.module';
import { BookingsModule } from '../bookings/bookings.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: VOICE_RETENTION_QUEUE }),
    AiModule,
    StorageModule,
    BookingsModule,
    MessagingModule,
  ],
  controllers: [VoiceController],
  providers: [
    TelephonyService,
    VoiceCallService,
    VoiceQueryService,
    MissedCallService,
    VoiceRetentionScheduler,
    VoiceRetentionProcessor,
  ],
})
export class VoiceModule {}
