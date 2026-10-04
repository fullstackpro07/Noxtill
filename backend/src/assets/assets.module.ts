import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RolesModule } from '../roles/roles.module';
import { FinanceModule } from '../finance/finance.module';
import { AssetsController } from './assets.controller';
import { AmContextService } from './am-context.service';
import { AmDataService } from './am-data.service';
import { AmViewsService } from './am-views.service';
import { AmDrawersService } from './am-drawers.service';
import { AmAssetsService } from './am-assets.service';
import { AmMaintService } from './am-maint.service';
import { AmWorkOrdersService } from './am-workorders.service';
import { AmPmService } from './am-pm.service';
import { AmTaxonomyService } from './am-taxonomy.service';
import { AmSettingsService } from './am-settings.service';
import { AmDocsService } from './am-docs.service';
import {
  ASSETS_QUEUE,
  AssetsProcessor,
  AssetsScheduler,
} from './assets.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: ASSETS_QUEUE }),
    RolesModule,
    FinanceModule,
  ],
  controllers: [AssetsController],
  providers: [
    AmContextService,
    AmDataService,
    AmViewsService,
    AmDrawersService,
    AmAssetsService,
    AmMaintService,
    AmWorkOrdersService,
    AmPmService,
    AmTaxonomyService,
    AmSettingsService,
    AmDocsService,
    AssetsScheduler,
    AssetsProcessor,
  ],
  exports: [AmContextService],
})
export class AssetsModule {}
