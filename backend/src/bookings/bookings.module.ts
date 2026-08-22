import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PublicBookingService } from './public-booking.service';
import { AppointmentsService } from './appointments.service';
import { WaitlistService } from './waitlist.service';
import { QueueService } from './queue.service';
import { DepositsService } from './deposits.service';
import { DepositSettingsService } from './deposit-settings.service';
import { BookingLinkService } from './booking-link.service';
import { ReminderRulesService } from './reminder-rules.service';
import { PublicBookingController } from './public-booking.controller';
import { PublicAppointmentController } from './public-appointment.controller';
import { AppointmentsController } from './appointments.controller';
import { WaitlistController } from './waitlist.controller';
import { QueueController } from './queue.controller';
import { DepositsController } from './deposits.controller';
import { BookingLinkController } from './booking-link.controller';
import { ReminderRulesController } from './reminder-rules.controller';
import { BookingRemindersScheduler } from './jobs/booking-reminders.scheduler';
import { BookingRemindersProcessor } from './jobs/booking-reminders.processor';
import { BOOKING_REMINDERS_QUEUE } from './jobs/booking-reminders.constants';
import { MessagingModule } from '../messaging/messaging.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { ActivityModule } from '../activity/activity.module';
import { PdfModule } from '../common/pdf/pdf.module';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: BOOKING_REMINDERS_QUEUE }),
    MessagingModule,
    ReviewsModule,
    ActivityModule,
    PdfModule,
    StorageModule,
  ],
  controllers: [
    PublicBookingController,
    PublicAppointmentController,
    BookingLinkController,
    ReminderRulesController,
    AppointmentsController,
    WaitlistController,
    QueueController,
    DepositsController,
  ],
  providers: [
    PublicBookingService,
    AppointmentsService,
    WaitlistService,
    QueueService,
    DepositsService,
    DepositSettingsService,
    BookingLinkService,
    ReminderRulesService,
    BookingRemindersScheduler,
    BookingRemindersProcessor,
  ],
  exports: [PublicBookingService, AppointmentsService],
})
export class BookingsModule {}
