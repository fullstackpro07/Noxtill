import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiSettingsService } from './ai-settings.service';
import { WhatIfDto } from './dto/what-if.dto';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiSettings: AiSettingsService,
  ) {}

  @Post('what-if')
  whatIf(@CurrentUser() user: AuthenticatedUser, @Body() dto: WhatIfDto) {
    return this.aiService.whatIf(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.AI_SETTINGS_MANAGE)
  @Get('settings')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.aiSettings.getSettings(user.businessId);
  }

  @RequireCapability(CAPABILITIES.AI_SETTINGS_MANAGE)
  @Patch('settings')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAiSettingsDto,
  ) {
    return this.aiSettings.updateSettings(user.businessId, dto);
  }
}
