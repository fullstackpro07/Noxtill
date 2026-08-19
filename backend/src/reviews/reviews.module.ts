import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReviewRequestsService } from './review-requests.service';
import { ReviewsService } from './reviews.service';
import { PublicReviewService } from './public-review.service';
import { QrPosterService } from './qr-poster.service';
import { VideoTestimonialsService } from './video-testimonials.service';
import { PublicVideoTestimonialService } from './public-video-testimonial.service';
import { ReviewsController } from './reviews.controller';
import { PublicReviewController } from './public-review.controller';
import { VideoTestimonialsController } from './video-testimonials.controller';
import { PublicVideoTestimonialController } from './public-video-testimonial.controller';
import { ReviewRemindersScheduler } from './jobs/review-reminders.scheduler';
import { ReviewRemindersProcessor } from './jobs/review-reminders.processor';
import { REVIEW_REMINDERS_QUEUE } from './jobs/review-reminders.constants';
import { GoogleSyncScheduler } from './jobs/google-sync.scheduler';
import { GoogleSyncProcessor } from './jobs/google-sync.processor';
import { GOOGLE_SYNC_QUEUE } from './jobs/google-sync.constants';
import { SentimentAnalysisService } from './sentiment-analysis.service';
import { SentimentAnalysisScheduler } from './jobs/sentiment-analysis.scheduler';
import { SentimentAnalysisProcessor } from './jobs/sentiment-analysis.processor';
import { SENTIMENT_ANALYSIS_QUEUE } from './sentiment-analysis.constants';
import { MessagingModule } from '../messaging/messaging.module';
import { AiModule } from '../ai/ai.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: REVIEW_REMINDERS_QUEUE },
      { name: GOOGLE_SYNC_QUEUE },
      { name: SENTIMENT_ANALYSIS_QUEUE },
    ),
    MessagingModule,
    AiModule,
    ActivityModule,
  ],
  controllers: [
    ReviewsController,
    PublicReviewController,
    VideoTestimonialsController,
    PublicVideoTestimonialController,
  ],
  providers: [
    ReviewRequestsService,
    ReviewsService,
    PublicReviewService,
    QrPosterService,
    ReviewRemindersScheduler,
    ReviewRemindersProcessor,
    GoogleSyncScheduler,
    GoogleSyncProcessor,
    VideoTestimonialsService,
    PublicVideoTestimonialService,
    SentimentAnalysisService,
    SentimentAnalysisScheduler,
    SentimentAnalysisProcessor,
  ],
  exports: [ReviewRequestsService],
})
export class ReviewsModule {}
