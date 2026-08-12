import { Module } from '@nestjs/common';
import { CreditService } from './credit.service';
import { CreditReminderService } from './credit-reminder.service';
import { CreditStatementService } from './credit-statement.service';
import { CreditController } from './credit.controller';
import { MessagingModule } from '../messaging/messaging.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [MessagingModule, ActivityModule],
  controllers: [CreditController],
  providers: [CreditService, CreditReminderService, CreditStatementService],
})
export class CreditModule {}
