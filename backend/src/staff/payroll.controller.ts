import { Controller, Get, Query } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { QueryPayrollDto } from './dto/query-payroll.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

/** Owner-only — same convention as `exports.controller.ts`'s full-account exports. */
@Controller()
@RequireCapability(CAPABILITIES.PAYROLL_EXPORT)
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('payroll/export.xlsx')
  export(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPayrollDto,
  ) {
    return this.payroll.export(user.businessId, query.month);
  }
}
