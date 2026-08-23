import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreditService } from './credit.service';
import { CreditReminderService } from './credit-reminder.service';
import { CreditStatementService } from './credit-statement.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RemindDto } from './dto/remind.dto';
import { CreateInstallmentPlanDto } from './dto/create-installment-plan.dto';
import { WriteOffCreditDto } from './dto/write-off-credit.dto';
import { BulkCustomerActionDto } from './dto/bulk-customer-action.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('credit')
export class CreditController {
  constructor(
    private readonly creditService: CreditService,
    private readonly reminderService: CreditReminderService,
    private readonly statementService: CreditStatementService,
  ) {}

  /** Outstanding view (UPD-BE-093) — `?sort=overdue` reuses this same real query, urgency-sorted. */
  @Get()
  listDebtors(@Query('sort') sort?: 'balance' | 'overdue') {
    return this.creditService.listDebtors(sort);
  }

  /** Overdue ageing (UPD-BE-094). */
  @Get('overdue')
  overdueAgeing() {
    return this.creditService.overdueAgeing();
  }

  /** Due Today screen's "collected-today" card (UPD-FE-076). */
  @Get('collected-today')
  collectedToday() {
    return this.creditService.collectedToday();
  }

  /** Recovery Reports (UPD-BE-096) — Owner-only. */
  @RequireCapability(CAPABILITIES.CREDIT_RECOVERY_REPORT_VIEW)
  @Get('recovery-report')
  recoveryReport(@Query('months') months?: string) {
    return this.creditService.recoveryReport(
      months ? Number(months) : undefined,
    );
  }

  /** Outstanding/Overdue screens' "bulk-remind-selected" (UPD-FE-075/077). */
  @Post('bulk-remind')
  bulkRemind(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkCustomerActionDto,
  ) {
    return this.reminderService.bulkRemind(
      user.businessId,
      dto.customerIds,
      dto.tone,
    );
  }

  /** Statements screen's "bulk generate" (UPD-FE-078). */
  @Post('bulk-statements')
  bulkStatements(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkCustomerActionDto,
  ) {
    return this.statementService.bulkGenerate(user.businessId, dto.customerIds);
  }

  @Get(':customer/entries')
  entries(@Param('customer') customerId: string) {
    return this.creditService.getLedger(customerId);
  }

  // Not @Audited() here: CreditService.recordPayment writes its own audit_log
  // row directly (with real before/after balances), same pattern as sales.
  @Post('payments')
  recordPayment(@Body() dto: RecordPaymentDto) {
    return this.creditService.recordPayment(dto);
  }

  @Post('remind')
  remind(@CurrentUser() user: AuthenticatedUser, @Body() dto: RemindDto) {
    return this.reminderService.remind(user.businessId, dto);
  }

  @Get(':customer/statement')
  statement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customer') customerId: string,
  ) {
    return this.statementService.generate(user.businessId, customerId);
  }

  @Post(':customer/statement/send')
  sendStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customer') customerId: string,
  ) {
    return this.statementService.send(user.businessId, customerId);
  }

  @Post(':customer/installment-plan')
  createInstallmentPlan(
    @Param('customer') customerId: string,
    @Body() dto: CreateInstallmentPlanDto,
  ) {
    return this.creditService.createInstallmentPlan(customerId, dto);
  }

  @Get(':customer/installment-plans')
  listInstallmentPlans(@Param('customer') customerId: string) {
    return this.creditService.listInstallmentPlans(customerId);
  }

  @Post(':customer/share-link')
  createShareLink(@Param('customer') customerId: string) {
    return this.creditService.createShareLink(customerId);
  }

  @Get(':customer/share-links')
  listShareLinks(@Param('customer') customerId: string) {
    return this.creditService.listShareLinks(customerId);
  }

  @Post('share-link/:id/revoke')
  revokeShareLink(@Param('id') id: string) {
    return this.creditService.revokeShareLink(id);
  }

  /** Owner-only, irreversible — see WriteOffCreditDto's typed-confirmation gate. */
  @RequireCapability(CAPABILITIES.CREDIT_WRITE_OFF)
  @Post(':customer/write-off')
  writeOff(
    @Param('customer') customerId: string,
    @Body() dto: WriteOffCreditDto,
  ) {
    return this.creditService.writeOff(customerId, dto);
  }
}
