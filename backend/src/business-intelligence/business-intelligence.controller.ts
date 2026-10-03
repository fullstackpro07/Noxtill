import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { BusinessIntelligenceService } from './business-intelligence.service';
import { AskBusinessBrainDto } from './dto/ask-business-brain.dto';

@Controller('business-intelligence')
export class BusinessIntelligenceController {
  constructor(private readonly service: BusinessIntelligenceService) {}

  @Get('overview')
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.service.overview(user.businessId);
  }

  @Get('brain/answers')
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  answers(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listBrainAnswers(user.businessId);
  }

  @Post('brain/ask')
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  ask(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AskBusinessBrainDto,
  ) {
    return this.service.askBusinessBrain(
      user.businessId,
      user.sub,
      dto.question,
    );
  }
}
