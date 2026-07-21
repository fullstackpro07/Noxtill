import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { SegmentsController } from './segments.controller';
import { SegmentsService } from './segments.service';
import { CrmJobsScheduler } from './jobs/crm-jobs.scheduler';
import { CrmJobsProcessor } from './jobs/crm-jobs.processor';
import { CRM_JOBS_QUEUE } from './jobs/crm-jobs.constants';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: CRM_JOBS_QUEUE }),
    MessagingModule,
  ],
  controllers: [CustomersController, SegmentsController],
  providers: [
    CustomersService,
    SegmentsService,
    CrmJobsScheduler,
    CrmJobsProcessor,
  ],
  exports: [CustomersService],
})
export class CustomersModule {}
