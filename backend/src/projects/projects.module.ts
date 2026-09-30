import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UnifiedInboxModule } from '../unified-inbox/unified-inbox.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { ProjectHooksService } from './project-hooks.service';
import { PROJECTS_QUEUE } from './projects.constants';
import { ProjectsController } from './projects.controller';
import { ProjectPortalPublicController } from './project-portal-public.controller';
import { ProjectsContextService } from './projects-context.service';
import { ProjectsPermissionsService } from './projects-permissions.service';
import { ProjectsLoaderService } from './projects-loader.service';
import { ProjectsService } from './projects.service';
import { ProjectTasksService } from './project-tasks.service';
import { ProjectMilestonesService } from './project-milestones.service';
import { ProjectFilesService } from './project-files.service';
import { ProjectTimeService } from './project-time.service';
import { ProjectApprovalsService } from './project-approvals.service';
import { ProjectPortalService } from './project-portal.service';
import { ProjectReportsService } from './project-reports.service';
import { ProjectTemplatesService } from './project-templates.service';
import { ProjectSettingsService } from './project-settings.service';
import { ProjectAiService } from './project-ai.service';
import { ProjectActivityService } from './project-activity.service';
import {
  ProjectsDailyProcessor,
  ProjectsDailyScheduler,
} from './projects-daily.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: PROJECTS_QUEUE }),
    AiModule,
    MessagingModule,
    NotificationsModule,
    UnifiedInboxModule,
    ReviewsModule,
  ],
  controllers: [ProjectsController, ProjectPortalPublicController],
  providers: [
    ProjectsContextService,
    ProjectHooksService,
    ProjectsPermissionsService,
    ProjectsLoaderService,
    ProjectsService,
    ProjectTasksService,
    ProjectMilestonesService,
    ProjectFilesService,
    ProjectTimeService,
    ProjectApprovalsService,
    ProjectPortalService,
    ProjectReportsService,
    ProjectTemplatesService,
    ProjectSettingsService,
    ProjectAiService,
    ProjectActivityService,
    ProjectsDailyScheduler,
    ProjectsDailyProcessor,
  ],
})
export class ProjectsModule {}
