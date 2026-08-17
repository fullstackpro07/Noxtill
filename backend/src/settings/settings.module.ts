import { Module } from '@nestjs/common';
import { TerminologyService } from './terminology.service';
import { TerminologyController } from './terminology.controller';
import { OptionsService } from './options.service';
import { OptionsController } from './options.controller';

@Module({
  controllers: [TerminologyController, OptionsController],
  providers: [TerminologyService, OptionsService],
  exports: [TerminologyService],
})
export class SettingsModule {}
