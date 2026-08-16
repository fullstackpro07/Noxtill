import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreditService } from './credit.service';
import { CreditReminderService } from './credit-reminder.service';
import { CreditStatementService } from './credit-statement.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RemindDto } from './dto/remind.dto';
import { CreateInstallmentPlanDto } from './dto/create-installment-plan.dto';
import { WriteOffCreditDto } from './dto/write-off-credit.dto';
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

  @Get()
  listDebtors() {
    return this.creditService.listDebtors();
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
