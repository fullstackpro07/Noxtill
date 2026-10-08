import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ContractsModule } from '../contracts/contracts.module';
import { ProjectsModule } from '../projects/projects.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PdfModule } from '../common/pdf/pdf.module';
import { FinanceModule } from '../finance/finance.module';
import { TokenCipherService } from '../integrations/token-cipher.service';
import { PeopleController } from './people.controller';
import { PeoplePublicController } from './people-public.controller';
import { PpContextService } from './pp-context.service';
import { PpDataService } from './pp-data.service';
import { PpViewsService } from './pp-views.service';
import { PpDrawersService } from './pp-drawers.service';
import { PpBridgeService } from './pp-bridge.service';
import { PpPeopleService } from './pp-people.service';
import { PpRecruitService } from './pp-recruit.service';
import { PpLeaveService } from './pp-leave.service';
import { PpPayrollService } from './pp-payroll.service';
import { PpHrService } from './pp-hr.service';
import { PpSettingsService } from './pp-settings.service';
import { PpExportService } from './pp-export.service';
import { PeopleProcessor, PeopleScheduler } from './people.processor';
import { PP_QUEUE } from './pp.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: PP_QUEUE }),
    ContractsModule,
    ProjectsModule,
    MessagingModule,
    PdfModule,
    FinanceModule,
  ],
  controllers: [PeopleController, PeoplePublicController],
  providers: [
    TokenCipherService,
    PpContextService,
    PpDataService,
    PpViewsService,
    PpDrawersService,
    PpBridgeService,
    PpPeopleService,
    PpRecruitService,
    PpLeaveService,
    PpPayrollService,
    PpHrService,
    PpSettingsService,
    PpExportService,
    PeopleScheduler,
    PeopleProcessor,
  ],
})
export class PeopleModule {}
