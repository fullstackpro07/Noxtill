import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreditService } from './credit.service';
import { CreditReminderService } from './credit-reminder.service';
import { CreditStatementService } from './credit-statement.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RemindDto } from './dto/remind.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

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
}
