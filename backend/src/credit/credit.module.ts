import { Module } from '@nestjs/common';
import { CreditService } from './credit.service';
import { CreditReminderService } from './credit-reminder.service';
import { CreditStatementService } from './credit-statement.service';
import { CreditController } from './credit.controller';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  controllers: [CreditController],
  providers: [CreditService, CreditReminderService, CreditStatementService],
})
export class CreditModule {}
