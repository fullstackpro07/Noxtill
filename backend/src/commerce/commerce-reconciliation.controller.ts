import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CommerceReconciliationService } from './commerce-reconciliation.service';

class DecideReconItemDto {
  @IsIn(['resolved', 'dismissed'])
  status!: 'resolved' | 'dismissed';

  @IsString()
  @MaxLength(2000)
  note!: string;
}

@Controller('commerce/reconciliation')
export class CommerceReconciliationController {
  constructor(private readonly reconciliation: CommerceReconciliationService) {}

  @Get()
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.reconciliation.overview(user.businessId);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('run')
  run(@CurrentUser() user: AuthenticatedUser) {
    return this.reconciliation.run(user.businessId, user.sub);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('items/:id/decision')
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideReconItemDto,
  ) {
    return this.reconciliation.decide(
      user.businessId,
      user.sub,
      id,
      dto.status,
      dto.note,
    );
  }
}
