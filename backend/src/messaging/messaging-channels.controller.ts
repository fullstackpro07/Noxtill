import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { MessagingChannelsService } from './messaging-channels.service';
import { UpdateChannelPriorityDto } from './dto/update-channel-priority.dto';
import { SetTemplateApprovalDto } from './dto/set-template-approval.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('messaging')
export class MessagingChannelsController {
  constructor(private readonly channels: MessagingChannelsService) {}

  @Get('channels')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.channels.getSettings(user.businessId);
  }

  @RequireCapability(CAPABILITIES.MESSAGING_CHANNELS_MANAGE)
  @Patch('channels')
  updatePriority(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateChannelPriorityDto,
  ) {
    return this.channels.updatePriority(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.MESSAGING_CHANNELS_MANAGE)
  @Patch('templates/:key/approval')
  setTemplateApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: SetTemplateApprovalDto,
  ) {
    return this.channels.setTemplateApproval(user.businessId, key, dto);
  }
}
