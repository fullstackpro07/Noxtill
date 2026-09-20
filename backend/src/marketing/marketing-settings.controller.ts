import { Controller, Get } from '@nestjs/common';
import { MarketingSettingsService } from './marketing-settings.service';

@Controller('marketing/settings')
export class MarketingSettingsController {
  constructor(private readonly settings: MarketingSettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }
}
