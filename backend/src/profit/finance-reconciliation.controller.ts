import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  FinanceReconciliationDecisionDto,
  FinanceReconciliationMatchDto,
  ImportFinanceBankStatementDto,
} from './dto/finance-reconciliation.dto';
import { FinanceReconciliationService } from './finance-reconciliation.service';

@RequireCapability(CAPABILITIES.PROFIT_VIEW)
@Controller('profit/reconciliation')
export class FinanceReconciliationController {
  constructor(private readonly reconciliation: FinanceReconciliationService) {}

  @Get('accounts')
  listAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.reconciliation.listAccounts(user.businessId);
  }

  @Get('imports')
  listImports(@CurrentUser() user: AuthenticatedUser) {
    return this.reconciliation.listImports(user.businessId);
  }

  @Get('imports/:id')
  getImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('page') page?: string,
  ) {
    return this.reconciliation.getImport(user.businessId, id, Number(page ?? 1));
  }

  @Get('imports/:id/export')
  exportImportCsv(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reconciliation.exportImportCsv(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.FINANCE_JOURNAL_MANAGE)
  @Post('imports')
  importStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ImportFinanceBankStatementDto,
  ) {
    return this.reconciliation.importStatement(user.businessId, user.sub, body);
  }

  @RequireCapability(CAPABILITIES.FINANCE_JOURNAL_MANAGE)
  @Post('lines/:id/accept')
  acceptMatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: FinanceReconciliationMatchDto,
  ) {
    return this.reconciliation.acceptMatch(user.businessId, user.sub, id, body);
  }

  @RequireCapability(CAPABILITIES.FINANCE_JOURNAL_MANAGE)
  @Post('lines/:id/reject')
  rejectSuggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: FinanceReconciliationDecisionDto,
  ) {
    return this.reconciliation.rejectSuggestions(user.businessId, user.sub, id, body);
  }

  @RequireCapability(CAPABILITIES.FINANCE_JOURNAL_MANAGE)
  @Post('lines/:id/reopen')
  reopenLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: FinanceReconciliationDecisionDto,
  ) {
    return this.reconciliation.reopenLine(user.businessId, user.sub, id, body);
  }
}
