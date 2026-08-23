import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CreditService } from './credit.service';
import { CreditReminderService } from './credit-reminder.service';
import { CreditStatementService } from './credit-statement.service';
import { CreditReminderRulesService } from './credit-reminder-rules.service';
import { InstallmentsService } from './installments.service';
import { PublicCreditService } from './public-credit.service';
import { CreditController } from './credit.controller';
import { InstallmentsController } from './installments.controller';
import { PublicCreditController } from './public-credit.controller';
import { CreditReminderRulesController } from './credit-reminder-rules.controller';
import { CreditRemindersScheduler } from './jobs/credit-reminders.scheduler';
import { CreditRemindersProcessor } from './jobs/credit-reminders.processor';
import { CREDIT_REMINDERS_QUEUE } from './jobs/credit-reminders.constants';
import { MessagingModule } from '../messaging/messaging.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    MessagingModule,
    ActivityModule,
    BullModule.registerQueue({ name: CREDIT_REMINDERS_QUEUE }),
  ],
  controllers: [
    CreditController,
    InstallmentsController,
    PublicCreditController,
    CreditReminderRulesController,
  ],
  providers: [
    CreditService,
    CreditReminderService,
    CreditStatementService,
    CreditReminderRulesService,
    InstallmentsService,
    PublicCreditService,
    CreditRemindersScheduler,
    CreditRemindersProcessor,
  ],
  exports: [CreditService],
})
export class CreditModule {}
