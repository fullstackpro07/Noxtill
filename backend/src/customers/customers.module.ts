import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { SegmentsController } from './segments.controller';
import { SegmentsService } from './segments.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { MemoryNotesController } from './memory-notes.controller';
import { MemoryNotesService } from './memory-notes.service';
import { CrmJobsScheduler } from './jobs/crm-jobs.scheduler';
import { CrmJobsProcessor } from './jobs/crm-jobs.processor';
import { CRM_JOBS_QUEUE } from './jobs/crm-jobs.constants';
import { MessagingModule } from '../messaging/messaging.module';
import { BillingModule } from '../billing/billing.module';
import { AutomationsModule } from '../marketing/automations/automations.module';
import { AutomationModule as OutboundWebhookAutomationModule } from '../integrations/automation/automation.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: CRM_JOBS_QUEUE }),
    MessagingModule,
    BillingModule,
    AutomationsModule,
    OutboundWebhookAutomationModule,
  ],
  controllers: [
    CustomersController,
    SegmentsController,
    LoyaltyController,
    MembershipsController,
    MemoryNotesController,
  ],
  providers: [
    CustomersService,
    SegmentsService,
    CrmJobsScheduler,
    CrmJobsProcessor,
    LoyaltyService,
    MembershipsService,
    MemoryNotesService,
  ],
  exports: [CustomersService, SegmentsService, LoyaltyService],
})
export class CustomersModule {}
