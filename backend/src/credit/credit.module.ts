import { Module } from '@nestjs/common';
import { CreditService } from './credit.service';
import { CreditReminderService } from './credit-reminder.service';
import { CreditStatementService } from './credit-statement.service';
import { InstallmentsService } from './installments.service';
import { PublicCreditService } from './public-credit.service';
import { CreditController } from './credit.controller';
import { InstallmentsController } from './installments.controller';
import { PublicCreditController } from './public-credit.controller';
import { MessagingModule } from '../messaging/messaging.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [MessagingModule, ActivityModule],
  controllers: [
    CreditController,
    InstallmentsController,
    PublicCreditController,
  ],
  providers: [
    CreditService,
    CreditReminderService,
    CreditStatementService,
    InstallmentsService,
    PublicCreditService,
  ],
})
export class CreditModule {}
