import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { CustomersModule } from '../customers/customers.module';
import { MessagingModule } from '../messaging/messaging.module';
import { SpecialistAgentEventQueueModule } from '../common/agents/specialist-agent-event-queue.module';
import { CustomerAgentEventProcessor } from './customer-agent-event.processor';

@Module({
  imports: [CustomersModule, MessagingModule, SpecialistAgentEventQueueModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, CustomerAgentEventProcessor],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
