import { Module } from '@nestjs/common';
import { DigitizerService } from './digitizer.service';
import { DigitizerVisionService } from './digitizer-vision.service';
import { DigitizerAliasService } from './digitizer-alias.service';
import { DigitizerController } from './digitizer.controller';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [AiModule, StorageModule],
  controllers: [DigitizerController],
  providers: [DigitizerService, DigitizerVisionService, DigitizerAliasService],
})
export class DigitizerModule {}
