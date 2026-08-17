import { Body, Controller, Post } from '@nestjs/common';
import { AiContentStudioService } from './ai-content-studio.service';
import { GenerateCaptionDto } from './dto/ai-content.dto';
import { GenerateMediaImageDto } from './dto/media.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('ai/content')
export class AiContentController {
  constructor(private readonly studio: AiContentStudioService) {}

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Post('generate')
  generateCaption(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateCaptionDto,
  ) {
    return this.studio.generateCaption(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Post('generate-image')
  generateImage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateMediaImageDto,
  ) {
    return this.studio.generateImage(user.businessId, dto);
  }
}
