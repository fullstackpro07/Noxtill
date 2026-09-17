import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CustomerDuplicatesController } from './customer-duplicates.controller';
import { CustomerDuplicatesService } from './customer-duplicates.service';
import { CustomersExportController } from './customers-export.controller';
import { CustomersExportService } from './customers-export.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerCustomFieldsController } from './customer-custom-fields.controller';
import { CustomerCustomFieldsService } from './customer-custom-fields.service';
import { CustomerTagsController } from './customer-tags.controller';
import { CustomerTagsService } from './customer-tags.service';
import { CustomerMergeSettingsController } from './customer-merge-settings.controller';
import { CustomerMergeSettingsService } from './customer-merge-settings.service';
import { CustomerPrivacySettingsController } from './customer-privacy-settings.controller';
import { CustomerPrivacySettingsService } from './customer-privacy-settings.service';
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
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: CRM_JOBS_QUEUE }),
    MessagingModule,
    BillingModule,
    AutomationsModule,
    OutboundWebhookAutomationModule,
    AiModule,
  ],
  controllers: [
    // Registration order matters: these two register literal `customers/duplicates` and
    // `customers/export`/`customers/export-history` paths that would otherwise be swallowed by
    // `CustomersController`'s `customers/:id`-style dynamic routes if it came first.
    CustomerDuplicatesController,
    CustomersExportController,
    CustomersController,
    CustomerCustomFieldsController,
    CustomerTagsController,
    CustomerMergeSettingsController,
    CustomerPrivacySettingsController,
    SegmentsController,
    LoyaltyController,
    MembershipsController,
    MemoryNotesController,
  ],
  providers: [
    CustomerDuplicatesService,
    CustomersExportService,
    CustomersService,
    CustomerCustomFieldsService,
    CustomerTagsService,
    CustomerMergeSettingsService,
    CustomerPrivacySettingsService,
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
