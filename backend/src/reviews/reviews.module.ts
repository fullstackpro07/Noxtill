import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReviewRequestsService } from './review-requests.service';
import { ReviewsService } from './reviews.service';
import { PublicReviewService } from './public-review.service';
import { ReviewsController } from './reviews.controller';
import { PublicReviewController } from './public-review.controller';
import { ReviewRemindersScheduler } from './jobs/review-reminders.scheduler';
import { ReviewRemindersProcessor } from './jobs/review-reminders.processor';
import { REVIEW_REMINDERS_QUEUE } from './jobs/review-reminders.constants';
import { GoogleSyncScheduler } from './jobs/google-sync.scheduler';
import { GoogleSyncProcessor } from './jobs/google-sync.processor';
import { GOOGLE_SYNC_QUEUE } from './jobs/google-sync.constants';
import { MessagingModule } from '../messaging/messaging.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: REVIEW_REMINDERS_QUEUE },
      { name: GOOGLE_SYNC_QUEUE },
    ),
    MessagingModule,
    AiModule,
  ],
  controllers: [ReviewsController, PublicReviewController],
  providers: [
    ReviewRequestsService,
    ReviewsService,
    PublicReviewService,
    ReviewRemindersScheduler,
    ReviewRemindersProcessor,
    GoogleSyncScheduler,
    GoogleSyncProcessor,
  ],
  exports: [ReviewRequestsService],
})
export class ReviewsModule {}
