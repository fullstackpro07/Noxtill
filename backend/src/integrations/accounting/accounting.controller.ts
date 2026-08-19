import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { AccountingMappingService } from './accounting-mapping.service';
import { AccountingSyncService } from './accounting-sync.service';
import { UpsertAccountingMappingDto } from './dto/upsert-accounting-mapping.dto';
import { IntegrationProvider } from '@prisma/client';

@Controller('integrations/accounting')
export class AccountingController {
  constructor(
    private readonly mapping: AccountingMappingService,
    private readonly sync: AccountingSyncService,
  ) {}

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('mappings')
  listMappings(@Query('provider') provider?: IntegrationProvider) {
    return this.mapping.list(provider);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post('mappings')
  upsertMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertAccountingMappingDto,
  ) {
    return this.mapping.upsert(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Delete('mappings/:id')
  removeMapping(@Param('id') id: string) {
    return this.mapping.remove(id);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post('sync')
  runSync(@CurrentUser() user: AuthenticatedUser) {
    return this.sync.sync(user.businessId);
  }
}
