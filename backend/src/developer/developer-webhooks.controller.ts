import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { OutboundWebhookService } from '../integrations/automation/outbound-webhook.service';
import { CreateDeveloperWebhookDto } from './dto/create-developer-webhook.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { IntegrationProvider } from '@prisma/client';

/**
 * Developer & API's own outbound webhooks (UPD-BE-081) — `/outbound-webhooks` at the top level,
 * distinct from `/integrations/automation/webhooks` (Zapier/Make/n8n): same underlying
 * `OutboundWebhook` table and delivery pipeline (UPD-BE-074), filtered to `provider: developer`.
 */
@Controller('outbound-webhooks')
export class DeveloperWebhooksController {
  constructor(private readonly webhooks: OutboundWebhookService) {}

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get()
  list() {
    return this.webhooks.list([IntegrationProvider.developer]);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post()
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDeveloperWebhookDto,
  ) {
    return this.webhooks.subscribe(user.businessId, {
      provider: IntegrationProvider.developer,
      triggerKey: dto.triggerKey,
      targetUrl: dto.targetUrl,
    });
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Delete(':id')
  unsubscribe(@Param('id') id: string) {
    return this.webhooks.unsubscribe(id);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get(':id/deliveries')
  deliveries(@Param('id') id: string) {
    return this.webhooks.deliveries(id);
  }
}
