import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UnifiedInboxModule } from '../unified-inbox/unified-inbox.module';
import { HELPDESK_QUEUE } from './helpdesk.constants';
import { HelpdeskController } from './helpdesk.controller';
import { HelpdeskPublicController } from './helpdesk-public.controller';
import { HelpdeskContextService } from './helpdesk-context.service';
import { HelpdeskLoaderService } from './helpdesk-loader.service';
import { HelpdeskOpsService } from './helpdesk-ops.service';
import { HelpdeskDeliveryService } from './helpdesk-delivery.service';
import { HelpdeskTicketsService } from './helpdesk-tickets.service';
import { HelpdeskJobsService } from './helpdesk-jobs.service';
import { HelpdeskAdminService } from './helpdesk-admin.service';
import { HelpdeskContentService } from './helpdesk-content.service';
import { HelpdeskViewsService } from './helpdesk-views.service';
import { HelpdeskPortalService } from './helpdesk-portal.service';
import { HelpdeskProcessor, HelpdeskScheduler } from './helpdesk.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: HELPDESK_QUEUE }),
    MessagingModule,
    NotificationsModule,
    UnifiedInboxModule,
  ],
  controllers: [HelpdeskController, HelpdeskPublicController],
  providers: [
    HelpdeskContextService,
    HelpdeskLoaderService,
    HelpdeskOpsService,
    HelpdeskDeliveryService,
    HelpdeskTicketsService,
    HelpdeskJobsService,
    HelpdeskAdminService,
    HelpdeskContentService,
    HelpdeskViewsService,
    HelpdeskPortalService,
    HelpdeskScheduler,
    HelpdeskProcessor,
  ],
})
export class HelpdeskModule {}
