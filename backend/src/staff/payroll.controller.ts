import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayrollLineItemsService } from './payroll-line-items.service';
import { QueryPayrollDto } from './dto/query-payroll.dto';
import { CreatePayrollLineItemDto } from './dto/create-payroll-line-item.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

/** Owner-only — same convention as `exports.controller.ts`'s full-account exports. */
@Controller()
@RequireCapability(CAPABILITIES.PAYROLL_EXPORT)
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly lineItems: PayrollLineItemsService,
  ) {}

  @Get('payroll/preview')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPayrollDto,
  ) {
    return this.payroll.preview(user.businessId, query.month);
  }

  @Get('payroll/export.xlsx')
  export(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPayrollDto,
  ) {
    return this.payroll.export(user.businessId, query.month);
  }

  @Get('payroll/line-items')
  listLineItems(@Query() query: QueryPayrollDto) {
    return this.lineItems.listForMonth(query.month);
  }

  @Post('payroll/line-items')
  createLineItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayrollLineItemDto,
  ) {
    return this.lineItems.create(
      user.businessId,
      dto.staffUserId,
      dto.month,
      dto.label,
      dto.amount,
      dto.type,
      user.sub,
    );
  }

  @Delete('payroll/line-items/:id')
  deleteLineItem(@Param('id') id: string) {
    return this.lineItems.delete(id);
  }
}
