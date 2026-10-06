import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MessagingModule } from '../messaging/messaging.module';
import { ProjectsModule } from '../projects/projects.module';
import { ContractsController } from './contracts.controller';
import { ContractsPublicController } from './contracts-public.controller';
import { CtContextService } from './ct-context.service';
import { CtDataService } from './ct-data.service';
import { CtFilesService } from './ct-files.service';
import { CtApprovalsService } from './ct-approvals.service';
import { CtDocsService } from './ct-docs.service';
import { CtTemplatesService } from './ct-templates.service';
import { CtContractsService } from './ct-contracts.service';
import { CtEsignService } from './ct-esign.service';
import { CtComplianceService } from './ct-compliance.service';
import { CtSettingsService } from './ct-settings.service';
import { CtViewsService } from './ct-views.service';
import { CtDrawersService } from './ct-drawers.service';
import { CtExportService } from './ct-export.service';
import { ContractsProcessor, ContractsScheduler } from './contracts.processor';
import { CT_QUEUE } from './ct.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: CT_QUEUE }),
    MessagingModule,
    ProjectsModule,
  ],
  controllers: [ContractsController, ContractsPublicController],
  providers: [
    CtContextService,
    CtDataService,
    CtFilesService,
    CtApprovalsService,
    CtDocsService,
    CtTemplatesService,
    CtContractsService,
    CtEsignService,
    CtComplianceService,
    CtSettingsService,
    CtViewsService,
    CtDrawersService,
    CtExportService,
    ContractsScheduler,
    ContractsProcessor,
  ],
  exports: [CtContextService],
})
export class ContractsModule {}
