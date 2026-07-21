import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { WhatIfDto } from './dto/what-if.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('what-if')
  whatIf(@CurrentUser() user: AuthenticatedUser, @Body() dto: WhatIfDto) {
    return this.aiService.whatIf(user.businessId, dto);
  }
}
