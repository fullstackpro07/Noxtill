import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { FinanceBudgetsService } from './finance-budgets.service';
import {
  QueryFinanceBudgetsDto,
  SaveFinanceBudgetDto,
  FinanceBudgetDecisionDto,
} from './dto/finance-budget.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { Audited } from '../common/decorators/audited.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@RequireCapability(CAPABILITIES.PROFIT_VIEW)
@Controller('profit/budgets')
export class FinanceBudgetsController {
  constructor(private readonly budgets: FinanceBudgetsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryFinanceBudgetsDto,
  ) {
    return this.budgets.list(user.businessId, query.month);
  }

  @RequireCapability(CAPABILITIES.EXPENSES_MANAGE)
  @Post()
  @Audited('finance.budget_draft_saved', 'FinanceBudget')
  saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SaveFinanceBudgetDto,
  ) {
    return this.budgets.saveDraft(user.businessId, user.sub, body);
  }

  @RequireCapability(CAPABILITIES.EXPENSES_MANAGE)
  @Post(':id/submit')
  @Audited('finance.budget_submitted', 'FinanceBudget')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.budgets.submit(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.EXPENSES_MANAGE)
  @Post(':id/approve')
  @Audited('finance.budget_approved', 'FinanceBudget')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: FinanceBudgetDecisionDto,
  ) {
    return this.budgets.decide(
      user.businessId,
      user.sub,
      id,
      'approved',
      body.reason,
    );
  }

  @RequireCapability(CAPABILITIES.EXPENSES_MANAGE)
  @Post(':id/reject')
  @Audited('finance.budget_rejected', 'FinanceBudget')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: FinanceBudgetDecisionDto,
  ) {
    return this.budgets.decide(
      user.businessId,
      user.sub,
      id,
      'rejected',
      body.reason,
    );
  }
}
