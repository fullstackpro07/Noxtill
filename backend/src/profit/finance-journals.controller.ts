import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  CreateFinanceAccountDto,
  CreateFinanceJournalDto,
  FinanceJournalReversalDto,
  FinanceJournalDecisionDto,
  FinancePeriodLockDto,
} from './dto/finance-journals.dto';
import { FinanceJournalsService } from './finance-journals.service';

@RequireCapability(CAPABILITIES.PROFIT_VIEW)
@Controller('profit/journals')
export class FinanceJournalsController {
  constructor(private readonly journals: FinanceJournalsService) {}

  @Get('accounts')
  listAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.journals.listAccounts(user.businessId);
  }

  @RequireCapability(CAPABILITIES.FINANCE_JOURNAL_MANAGE)
  @Post('accounts')
  createAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateFinanceAccountDto,
  ) {
    return this.journals.createAccount(user.businessId, user.sub, body);
  }

  @Get()
  listJournals(
    @CurrentUser() user: AuthenticatedUser,
    @Query('month') month?: string,
  ) {
    return this.journals.listJournals(user.businessId, month);
  }

  @Get('activity')
  activitySummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('month') month: string,
  ) {
    return this.journals.activitySummary(user.businessId, month);
  }

  @Get('trial-balance')
  trialBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Query('asOf') asOf: string,
  ) {
    return this.journals.trialBalance(user.businessId, asOf);
  }

  @RequireCapability(CAPABILITIES.FINANCE_JOURNAL_MANAGE)
  @Post()
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateFinanceJournalDto,
  ) {
    return this.journals.createDraft(user.businessId, user.sub, body);
  }

  @RequireCapability(CAPABILITIES.FINANCE_JOURNAL_MANAGE)
  @Post(':id/submit')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.journals.submit(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.FINANCE_JOURNAL_MANAGE)
  @Post(':id/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: FinanceJournalDecisionDto,
  ) {
    return this.journals.decide(
      user.businessId,
      user.sub,
      id,
      'approved',
      body.reason,
    );
  }

  @RequireCapability(CAPABILITIES.FINANCE_JOURNAL_MANAGE)
  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: FinanceJournalDecisionDto,
  ) {
    return this.journals.decide(
      user.businessId,
      user.sub,
      id,
      'rejected',
      body.reason,
    );
  }

  @RequireCapability(CAPABILITIES.FINANCE_JOURNAL_MANAGE)
  @Post(':id/post')
  post(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.journals.post(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.FINANCE_JOURNAL_MANAGE)
  @Post(':id/reversal')
  createReversalDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: FinanceJournalReversalDto,
  ) {
    return this.journals.createReversalDraft(
      user.businessId,
      user.sub,
      id,
      body.reason,
    );
  }

  @RequireCapability(CAPABILITIES.FINANCE_PERIOD_LOCK)
  @Post('periods/lock')
  lockPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: FinancePeriodLockDto,
  ) {
    return this.journals.closePeriod(
      user.businessId,
      user.sub,
      body.month,
      body.reason,
    );
  }
}
