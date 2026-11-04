import { Controller, Get, Query } from '@nestjs/common';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { QueryPnlDto } from './dto/query-pnl.dto';
import { FinancePeriodCloseService } from './finance-period-close.service';

@RequireCapability(CAPABILITIES.PROFIT_VIEW)
@Controller('profit/period-close')
export class FinancePeriodCloseController {
  constructor(private readonly periodClose: FinancePeriodCloseService) {}

  @Get('readiness')
  readiness(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPnlDto,
  ) {
    return this.periodClose.readiness(
      user.businessId,
      query.month,
      query.branchId,
    );
  }
}
