import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CommerceStoreOpportunityStatus } from '@prisma/client';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { SetCommerceStoreOpportunityStatusDto } from './dto/commerce-store.dto';
import { CommerceStoreOptimizerService } from './commerce-store-optimizer.service';

@Controller('commerce/store-optimizer')
export class CommerceStoreOptimizerController {
  constructor(private readonly optimizer: CommerceStoreOptimizerService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.optimizer.summary(user.businessId);
  }

  @Get('opportunities')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(
      'status',
      new ParseEnumPipe(CommerceStoreOpportunityStatus, { optional: true }),
    )
    status?: CommerceStoreOpportunityStatus,
  ) {
    return this.optimizer.list(user.businessId, status);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('checks/run')
  run(@CurrentUser() user: AuthenticatedUser) {
    return this.optimizer.runChecks(user.businessId, user.sub);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('opportunities/:id/status')
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetCommerceStoreOpportunityStatusDto,
  ) {
    return this.optimizer.setStatus(
      user.businessId,
      user.sub,
      id,
      dto.status,
      dto.reason,
    );
  }
}
