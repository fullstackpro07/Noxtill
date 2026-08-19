import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { OutboundWebhookService } from './outbound-webhook.service';
import { CreateOutboundWebhookDto } from './dto/create-outbound-webhook.dto';
import { AUTOMATION_TRIGGERS } from './automation.constants';

@Controller('integrations/automation')
export class AutomationController {
  constructor(private readonly webhooks: OutboundWebhookService) {}

  @Get('triggers')
  triggers() {
    return AUTOMATION_TRIGGERS;
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('webhooks')
  list() {
    return this.webhooks.list();
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post('webhooks')
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOutboundWebhookDto,
  ) {
    return this.webhooks.subscribe(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Delete('webhooks/:id')
  unsubscribe(@Param('id') id: string) {
    return this.webhooks.unsubscribe(id);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('webhooks/:id/deliveries')
  deliveries(@Param('id') id: string) {
    return this.webhooks.deliveries(id);
  }
}
