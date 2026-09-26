import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { EcommerceSyncService } from './ecommerce-sync.service';
import {
  ECOMMERCE_PROVIDERS,
  SOURCE_OF_TRUTH_VALUES,
  type SourceOfTruth,
} from './ecommerce.constants';
import { IntegrationProvider } from '@prisma/client';

class SetSourceOfTruthDto {
  @IsIn(ECOMMERCE_PROVIDERS)
  provider!: IntegrationProvider;

  @IsIn([...SOURCE_OF_TRUTH_VALUES])
  value!: SourceOfTruth;
}

class ResolveConflictDto {
  @IsIn(['noxtill', 'store', 'custom'])
  choice!: 'noxtill' | 'store' | 'custom';

  @IsOptional()
  @IsInt()
  @Min(0)
  qty?: number;
}

@Controller('integrations/ecommerce')
export class EcommerceController {
  constructor(private readonly sync: EcommerceSyncService) {}

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post('sync')
  runSync(@CurrentUser() user: AuthenticatedUser) {
    return this.sync.sync(user.businessId);
  }

  /** E-commerce conflict history depth fix — a real, persisted, browsable conflict log. */
  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('conflicts')
  listConflicts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('provider') provider?: IntegrationProvider,
    @Query('status') status?: 'pending' | 'resolved' | 'auto',
  ) {
    return this.sync.listConflicts(user.businessId, provider, status);
  }

  /** Which system wins when both change the same stock — per connection. */
  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Put('source-of-truth')
  setSourceOfTruth(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetSourceOfTruthDto,
  ) {
    return this.sync.setSourceOfTruth(
      user.businessId,
      user.sub,
      dto.provider,
      dto.value,
    );
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post('conflicts/:id/resolve')
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveConflictDto,
  ) {
    return this.sync.resolveConflict(
      user.businessId,
      user.sub,
      id,
      dto.choice,
      dto.qty,
    );
  }
}
