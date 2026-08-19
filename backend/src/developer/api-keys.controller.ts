import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get()
  list() {
    return this.apiKeys.list();
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Delete(':id')
  revoke(@Param('id') id: string) {
    return this.apiKeys.revoke(id);
  }
}
