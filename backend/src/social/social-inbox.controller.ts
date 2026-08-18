import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SocialInboxService } from './social-inbox.service';
import { ReplyInboxItemDto } from './dto/social-inbox.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { SocialInboxStatus } from '@prisma/client';

@Controller('social/inbox')
export class SocialInboxController {
  constructor(private readonly inbox: SocialInboxService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: SocialInboxStatus,
  ) {
    return this.inbox.list(user.businessId, status);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Post(':id/reply')
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReplyInboxItemDto,
  ) {
    return this.inbox.reply(user.businessId, id, dto.text);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inbox.markRead(user.businessId, id);
  }
}
