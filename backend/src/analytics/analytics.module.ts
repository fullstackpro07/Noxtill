import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { CustomersModule } from '../customers/customers.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [CustomersModule, MessagingModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
