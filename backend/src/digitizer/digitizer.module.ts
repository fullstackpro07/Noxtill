import { Module } from '@nestjs/common';
import { DigitizerService } from './digitizer.service';
import { DigitizerVisionService } from './digitizer-vision.service';
import { DigitizerAliasService } from './digitizer-alias.service';
import { DigitizerLookupService } from './digitizer-lookup.service';
import { DigitizerAssessmentService } from './digitizer-assessment.service';
import { DigitizerPipelineService } from './digitizer-pipeline.service';
import { DigitizerViewService } from './digitizer-view.service';
import { DigitizerImportService } from './digitizer-import.service';
import { DigitizerInsightsService } from './digitizer-insights.service';
import { DigitizerSettingsService } from './digitizer-settings.service';
import { DigitizerController } from './digitizer.controller';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [AiModule, StorageModule],
  controllers: [DigitizerController],
  providers: [
    DigitizerService,
    DigitizerVisionService,
    DigitizerAliasService,
    DigitizerLookupService,
    DigitizerAssessmentService,
    DigitizerPipelineService,
    DigitizerViewService,
    DigitizerImportService,
    DigitizerInsightsService,
    DigitizerSettingsService,
  ],
  exports: [DigitizerVisionService],
})
export class DigitizerModule {}
