import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MessagingModule } from '../messaging/messaging.module';
import { PaymentsModule } from '../payments/payments.module';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { FieldServiceController } from './field-service.controller';
import { FsContextService } from './fs-context.service';
import { FsDataService } from './fs-data.service';
import { FsNotifyService } from './fs-notify.service';
import { FsViewsService } from './fs-views.service';
import { FsDrawersService } from './fs-drawers.service';
import { FsWorkOrdersService } from './fs-workorders.service';
import { FsRequestsService } from './fs-requests.service';
import { FsPartsService } from './fs-parts.service';
import { FsLaborService } from './fs-labor.service';
import { FsPlansService } from './fs-plans.service';
import { FsCasesService } from './fs-cases.service';
import { FsAdminService } from './fs-admin.service';
import { FsApprovalsService } from './fs-approvals.service';
import { FsDocsService } from './fs-docs.service';
import { FS_QUEUE } from './fs.constants';
import {
  FieldServiceProcessor,
  FieldServiceScheduler,
} from './field-service.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: FS_QUEUE }),
    MessagingModule,
    PaymentsModule,
    HelpdeskModule,
  ],
  controllers: [FieldServiceController],
  providers: [
    FsContextService,
    FsDataService,
    FsNotifyService,
    FsViewsService,
    FsDrawersService,
    FsWorkOrdersService,
    FsRequestsService,
    FsPartsService,
    FsLaborService,
    FsPlansService,
    FsCasesService,
    FsAdminService,
    FsApprovalsService,
    FsDocsService,
    FieldServiceScheduler,
    FieldServiceProcessor,
  ],
  exports: [FsContextService],
})
export class FieldServiceModule {}
