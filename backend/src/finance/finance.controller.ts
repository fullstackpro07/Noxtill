import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile as UploadedFileDecorator,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { AppException } from '../common/filters/app.exception';
import {
  FinanceContextService,
  FinActor,
  monthKey,
} from './finance-context.service';
import { FinanceViewsService } from './finance-views.service';
import { FinanceRecordsService } from './finance-records.service';
import { FinanceJournalsService } from './finance-journals.service';
import { FinanceSettingsService } from './finance-settings.service';
import { FinanceBankingService } from './finance-banking.service';
import { FinanceReceivablesService } from './finance-receivables.service';
import { FinancePayablesService } from './finance-payables.service';
import { FinanceTaxService } from './finance-tax.service';
import { FinanceAssetsService } from './finance-assets.service';
import { FinanceBudgetsService } from './finance-budgets.service';
import { FinanceCloseService } from './finance-close.service';
import { FinanceFxService } from './finance-fx.service';
import { FinanceDocsService } from './finance-docs.service';
import type { ExportFile, UploadedFile } from './finance-docs.service';
import { FinanceJobsService } from './finance-jobs.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { FIN_ERRORS, FinanceConfig, MAX_FILE_BYTES } from './finance.constants';
import {
  AccountDto,
  AccountPatchDto,
  ActiveDto,
  AssignDto,
  BankAccountDto,
  BankAccountPatchDto,
  BillDto,
  BudgetDto,
  BudgetImportDto,
  BudgetLineDto,
  CapitalizeDto,
  CollectionsDto,
  CommentDto,
  DuplicateQuery,
  DisposeDto,
  ExplainDto,
  ExportQuery,
  FiledDto,
  FinScopeQuery,
  HoldDto,
  InviteDto,
  JournalDto,
  KeyDto,
  MatchDto,
  NoteDto,
  PayDto,
  PeriodDto,
  RateDto,
  ReasonDto,
  ReconStartDto,
  ReverseDto,
  RuleDto,
  SettingsDto,
  SplitDto,
  SweepDto,
  TaxCodeDto,
  TimingDto,
} from './dto/finance.dto';

const fileUpload = () =>
  FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } });

function parsePeriod(p: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m)
    throw new AppException(
      FIN_ERRORS.INVALID,
      'Choose a month (YYYY-MM).',
      HttpStatus.BAD_REQUEST,
    );
  return { year: +m[1], month: +m[2] };
}

const CONFIG_KEYS: (keyof FinanceConfig)[] = [
  'profile',
  'posting',
  'thresholds',
  'sod',
  'close',
  'expensePaidFrom',
  'expenseMap',
  'arTermsDays',
  'departments',
  'materialPct',
  'materialAmt',
];

@Controller('finance')
export class FinanceController {
  constructor(
    private readonly ctx: FinanceContextService,
    private readonly views: FinanceViewsService,
    private readonly records: FinanceRecordsService,
    private readonly journals: FinanceJournalsService,
    private readonly settings: FinanceSettingsService,
    private readonly banking: FinanceBankingService,
    private readonly ar: FinanceReceivablesService,
    private readonly ap: FinancePayablesService,
    private readonly tax: FinanceTaxService,
    private readonly assets: FinanceAssetsService,
    private readonly budgets: FinanceBudgetsService,
    private readonly close: FinanceCloseService,
    private readonly fx: FinanceFxService,
    private readonly docs: FinanceDocsService,
    private readonly jobs: FinanceJobsService,
    private readonly ledger: FinanceLedgerService,
  ) {}

  private actor(user: AuthenticatedUser): Promise<FinActor> {
    return this.ctx.actor(user);
  }

  private send(res: Response, f: ExportFile) {
    res.setHeader('Content-Type', f.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${f.fileName}"`,
    );
    res.send(f.body);
  }

  // ── reads ────────────────────────────────────────────────────────────────

  @Get('boot')
  async boot(@CurrentUser() user: AuthenticatedUser) {
    return this.views.boot(await this.actor(user));
  }

  @Get('screen/:key')
  async screen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Query() q: FinScopeQuery,
  ) {
    return this.views.screen(await this.actor(user), key, q);
  }

  @Get('record/:kind/:id')
  async record(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Query() q: FinScopeQuery,
  ) {
    return this.records.record(await this.actor(user), kind, id, q);
  }

  @Get('approvals')
  async approvals(@CurrentUser() user: AuthenticatedUser) {
    const a = await this.actor(user);
    const rows = await this.ctx.db.finApproval.findMany({
      where: { businessId: a.rootId, status: 'Pending' },
      orderBy: { createdAt: 'desc' },
    });
    const names = await this.ctx.userNames(rows.map((r) => r.requestedById));
    return rows.map((r) => ({
      ...r,
      requestedBy: names.get(r.requestedById) ?? '—',
    }));
  }

  @Post('approvals/:id/approve')
  async approveGeneric(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommentDto,
  ) {
    const a = await this.actor(user);
    const ap = await this.ctx.db.finApproval.findFirst({
      where: { id, businessId: a.rootId, status: 'Pending' },
    });
    if (!ap)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Approval not found',
        HttpStatus.NOT_FOUND,
      );
    switch (ap.subjectType) {
      case 'journal':
        return this.journals.approve(a, ap.subjectId, dto.comment);
      case 'bill':
        return this.ap.approve(a, ap.subjectId, dto.comment);
      case 'reconciliation':
        return this.banking.approveRecon(a, ap.subjectId);
      case 'tax':
        return this.tax.approve(a, ap.subjectId);
      case 'budget':
        return this.budgets.approve(a, ap.subjectId);
      case 'settings':
        return this.settings.approveSettings(a, ap.id);
      case 'account':
        return this.settings.approveAccount(a, ap.id);
      case 'period': {
        this.ctx.need(a, 'admin', 'Approving a period reopen');
        return this.close.applyReopen(
          a,
          ap.subjectId,
          (ap.payload as { reason?: string } | null)?.reason ??
            'Approved reopen request',
        );
      }
    }
    throw new AppException(
      FIN_ERRORS.INVALID,
      'Unknown approval type',
      HttpStatus.BAD_REQUEST,
    );
  }

  @Post('approvals/:id/reject')
  async rejectGeneric(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ) {
    const a = await this.actor(user);
    const ap = await this.ctx.db.finApproval.findFirst({
      where: { id, businessId: a.rootId, status: 'Pending' },
    });
    if (!ap)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Approval not found',
        HttpStatus.NOT_FOUND,
      );
    if (ap.subjectType === 'journal')
      return this.journals.reject(a, ap.subjectId, dto.reason);
    if (ap.subjectType === 'bill')
      return this.ap.reject(a, ap.subjectId, dto.reason);
    if (ap.subjectType === 'budget')
      return this.budgets.reject(a, ap.subjectId, dto.reason);
    this.ctx.need(
      a,
      ap.approverRole === 'Finance Manager' ? 'approve' : 'admin',
      'Rejecting this request',
    );
    await this.journals.decide(
      a.rootId,
      ap.subjectType,
      ap.subjectId,
      'Rejected',
      a,
      dto.reason,
    );
    if (ap.subjectType === 'tax')
      await this.ctx.db.finTaxReturn.update({
        where: { id: ap.subjectId },
        data: { status: 'Calculated' },
      });
    if (ap.subjectType === 'reconciliation')
      await this.ctx.db.finReconciliation.update({
        where: { id: ap.subjectId },
        data: { status: 'In Progress' },
      });
    await this.ctx.audit(
      a.rootId,
      a,
      'approval.rejected',
      ap.subjectType,
      ap.subjectId,
      dto.reason,
    );
  }

  @Post('sweep')
  async sweep(@CurrentUser() user: AuthenticatedUser, @Body() dto: SweepDto) {
    const a = await this.actor(user);
    this.ctx.need(a, 'manage', 'Running the posting run');
    return this.jobs.run(a.rootId, { full: !!dto.full });
  }

  @Post('brief/dismiss')
  async dismiss(@CurrentUser() user: AuthenticatedUser, @Body() dto: KeyDto) {
    return this.views.dismiss(await this.actor(user), dto.key);
  }

  // ── journals ─────────────────────────────────────────────────────────────

  @Get('journals/:id')
  async getJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const a = await this.actor(user);
    return this.journals.posting.load(a.rootId, id);
  }

  @Post('journals')
  async createJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: JournalDto,
  ) {
    return this.journals.createDraft(await this.actor(user), dto);
  }

  @Put('journals/:id')
  async updateJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: JournalDto,
  ) {
    return this.journals.updateDraft(
      await this.actor(user),
      id,
      dto.version ?? 0,
      dto,
    );
  }

  @Post('journals/:id/submit')
  async submitJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.journals.submit(await this.actor(user), id);
  }

  @Post('journals/:id/review')
  async reviewJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.journals.review(await this.actor(user), id);
  }

  @Post('journals/:id/approve')
  async approveJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommentDto,
  ) {
    return this.journals.approve(await this.actor(user), id, dto.comment);
  }

  @Post('journals/:id/reject')
  async rejectJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.journals.reject(await this.actor(user), id, dto.reason);
  }

  @Post('journals/:id/post')
  async postJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.journals.post(await this.actor(user), id);
  }

  @Post('journals/:id/void')
  async voidJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: NoteDto,
  ) {
    return this.journals.voidDraft(await this.actor(user), id, dto.note);
  }

  @Post('journals/:id/reverse')
  async reverseJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReverseDto,
  ) {
    return this.journals.reverse(
      await this.actor(user),
      id,
      dto.date,
      dto.reason,
    );
  }

  // ── accounts ─────────────────────────────────────────────────────────────

  @Post('accounts')
  async addAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AccountDto,
  ) {
    return this.settings.addAccount(await this.actor(user), dto);
  }

  @Patch('accounts/:id')
  async editAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AccountPatchDto,
  ) {
    return this.settings.editAccount(await this.actor(user), id, dto);
  }

  @Post('accounts/:id/active')
  async setActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ActiveDto,
  ) {
    return this.settings.setActive(await this.actor(user), id, dto.active);
  }

  // ── banking ──────────────────────────────────────────────────────────────

  @Post('bank-accounts')
  async addBank(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BankAccountDto,
  ) {
    return this.banking.create(await this.actor(user), dto);
  }

  @Patch('bank-accounts/:id')
  async editBank(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: BankAccountPatchDto,
  ) {
    return this.banking.update(await this.actor(user), id, dto);
  }

  @Post('bank-accounts/:id/import')
  @UseInterceptors(fileUpload())
  async importStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFileDecorator() file: UploadedFile,
  ) {
    if (!file)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Choose a CSV or OFX file.',
        HttpStatus.BAD_REQUEST,
      );
    return this.banking.importStatement(await this.actor(user), id, file);
  }

  @Get('bank-lines/:id/candidates')
  async candidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const a = await this.actor(user);
    const l = await this.banking.mustLine(a.rootId, id);
    const rows = await this.banking.candidates(a.rootId, l, 45);
    const bills = await this.ctx.db.finBill.findMany({
      where: {
        businessId: a.rootId,
        status: { in: ['Posted', 'Partially Paid', 'Approved for Payment'] },
      },
      select: {
        id: true,
        number: true,
        vendorName: true,
        total: true,
        amountPaid: true,
        currency: true,
      },
    });
    return {
      ledger: rows.map((g) => ({
        id: g.id,
        date: g.date,
        journal: g.journal.number,
        label: g.journal.sourceLabel ?? g.journal.memo ?? g.description,
        amount: Number(g.txnDebit) - Number(g.txnCredit),
      })),
      bills: bills.map((b) => ({
        id: b.id,
        label: `${b.number} · ${b.vendorName}`,
        open: Number(b.total) - Number(b.amountPaid),
        currency: b.currency,
      })),
    };
  }

  @Post('bank-lines/:id/match')
  async match(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MatchDto,
  ) {
    return this.banking.match(await this.actor(user), id, dto);
  }

  @Post('bank-lines/:id/split')
  async split(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SplitDto,
  ) {
    return this.banking.split(await this.actor(user), id, dto.parts);
  }

  @Post('bank-lines/:id/unmatch')
  async unmatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.banking.unmatch(await this.actor(user), id);
  }

  @Post('bank-lines/:id/exclude')
  async exclude(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.banking.exclude(await this.actor(user), id, dto.reason);
  }

  @Get('bank-rules')
  async rules(@CurrentUser() user: AuthenticatedUser) {
    const a = await this.actor(user);
    return this.ctx.db.finBankRule.findMany({
      where: { businessId: a.rootId, active: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('bank-rules')
  async createRule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RuleDto,
  ) {
    return this.banking.createRule(await this.actor(user), dto);
  }

  @Delete('bank-rules/:id')
  async deleteRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.banking.deleteRule(await this.actor(user), id);
  }

  // ── reconciliation ───────────────────────────────────────────────────────

  @Post('reconciliations')
  async startRecon(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReconStartDto,
  ) {
    return this.banking.startRecon(await this.actor(user), dto);
  }

  @Get('reconciliations/:id')
  async workspace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const a = await this.actor(user);
    const w = await this.banking.workspace(a.rootId, id);
    const names = await this.ctx.userNames([
      w.recon.preparedById,
      w.recon.approvedById,
    ]);
    const cfg = await this.ctx.config(a.rootId);
    return {
      ...w,
      preparer: names.get(w.recon.preparedById ?? '') ?? '—',
      approver: names.get(w.recon.approvedById ?? '') ?? null,
      canApprove:
        a.approve && (!cfg.sod.sod3 || w.recon.preparedById !== a.userId),
      sodOn: cfg.sod.sod3,
      me: a.userId,
    };
  }

  @Post('reconciliations/:id/timing')
  async timing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TimingDto,
  ) {
    return this.banking.markTiming(
      await this.actor(user),
      id,
      dto.lineId,
      dto.on,
      dto.note,
    );
  }

  @Post('reconciliations/:id/submit')
  async submitRecon(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.banking.submitRecon(await this.actor(user), id);
  }

  @Post('reconciliations/:id/approve')
  async approveRecon(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.banking.approveRecon(await this.actor(user), id);
  }

  @Post('reconciliations/:id/reopen')
  async reopenRecon(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.banking.reopenRecon(await this.actor(user), id, dto.reason);
  }

  // ── receivables ──────────────────────────────────────────────────────────

  @Post('ar/:orderId/dispute')
  async dispute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.ar.dispute(await this.actor(user), orderId, dto.reason);
  }

  @Post('ar/:orderId/resolve')
  async resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.ar.resolveDispute(await this.actor(user), orderId, dto.reason);
  }

  @Post('ar/collections')
  async collections(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CollectionsDto,
  ) {
    return this.ar.collections(await this.actor(user), dto.itemId, dto.tone);
  }

  // ── bills ────────────────────────────────────────────────────────────────

  @Get('bills/meta')
  async billMeta(@CurrentUser() user: AuthenticatedUser) {
    const a = await this.actor(user);
    return {
      suppliers: await this.ap.suppliers(a.rootId),
      purchaseOrders: await this.ap.purchaseOrders(a.rootId),
    };
  }

  @Get('bills/duplicates')
  async billDuplicates(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: DuplicateQuery,
  ) {
    const a = await this.actor(user);
    return this.ap.checkDuplicate(
      a.rootId,
      q.vendor ?? '',
      q.supplierId ?? null,
      q.invoice ?? '',
      q.exclude,
    );
  }

  @Get('bills/:id')
  async getBill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const a = await this.actor(user);
    return this.ap.mustBill(a.rootId, id);
  }

  @Post('bills/scan')
  @UseInterceptors(fileUpload())
  async scanBill(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFileDecorator() file: UploadedFile,
  ) {
    if (!file)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Choose a photo or PDF of the bill.',
        HttpStatus.BAD_REQUEST,
      );
    return this.docs.scanBill(await this.actor(user), file);
  }

  @Post('bills/upload')
  @UseInterceptors(fileUpload())
  async uploadBillDoc(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFileDecorator() file: UploadedFile,
  ) {
    if (!file)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Choose a file.',
        HttpStatus.BAD_REQUEST,
      );
    const a = await this.actor(user);
    this.ctx.need(a, 'manage', 'Uploading a bill');
    return this.docs.store(a, 'bill-docs', file);
  }

  @Post('bills')
  async createBill(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BillDto,
  ) {
    return this.ap.create(await this.actor(user), dto as never);
  }

  @Put('bills/:id')
  async updateBill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: BillDto,
  ) {
    return this.ap.update(await this.actor(user), id, dto as never);
  }

  @Post('bills/:id/submit')
  async submitBill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.ap.submit(await this.actor(user), id);
  }

  @Post('bills/:id/approve')
  async approveBill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommentDto,
  ) {
    return this.ap.approve(await this.actor(user), id, dto.comment);
  }

  @Post('bills/:id/reject')
  async rejectBill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.ap.reject(await this.actor(user), id, dto.reason);
  }

  @Post('bills/:id/post')
  async postBill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.ap.post(await this.actor(user), id);
  }

  @Post('bills/:id/clear-review')
  async clearReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.ap.clearReview(await this.actor(user), id, dto.reason);
  }

  @Post('bills/:id/approve-payment')
  async approvePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.ap.approveForPayment(await this.actor(user), id);
  }

  @Post('bills/:id/hold')
  async hold(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: HoldDto,
  ) {
    return this.ap.hold(await this.actor(user), id, dto.on, dto.reason);
  }

  @Post('bills/:id/void')
  async voidBill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.ap.void(await this.actor(user), id, dto.reason);
  }

  @Post('bills/:id/pay')
  async pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PayDto,
  ) {
    return this.ap.recordPayment(await this.actor(user), id, dto);
  }

  @Post('bill-payments/:id/void')
  async voidPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.ap.voidPayment(await this.actor(user), id, dto.reason);
  }

  // ── tax ──────────────────────────────────────────────────────────────────

  @Post('tax/:id/submit')
  async taxSubmit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.tax.submit(await this.actor(user), id);
  }

  @Post('tax/:id/approve')
  async taxApprove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.tax.approve(await this.actor(user), id);
  }

  @Post('tax/:id/reopen')
  async taxReopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.tax.reopen(await this.actor(user), id, dto.reason);
  }

  @Post('tax/:id/filed')
  async taxFiled(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FiledDto,
  ) {
    return this.tax.filed(await this.actor(user), id, dto);
  }

  @Post('tax-codes')
  async taxCode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TaxCodeDto,
  ) {
    return this.settings.setTaxCode(await this.actor(user), dto);
  }

  // ── assets ───────────────────────────────────────────────────────────────

  @Post('assets')
  async capitalize(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CapitalizeDto,
  ) {
    return this.assets.capitalize(await this.actor(user), dto);
  }

  @Get('depreciation')
  async depPreview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: FinScopeQuery,
  ) {
    const a = await this.actor(user);
    const { year, month } = parsePeriod(q.period ?? '');
    const pv = await this.assets.preview(a.rootId, year, month);
    return {
      ...pv,
      rows: pv.rows.map((r) => ({
        id: r.asset.id,
        name: r.asset.name,
        number: r.asset.number,
        open: r.open,
        dep: r.dep,
        close: r.close,
        method: r.asset.method,
      })),
    };
  }

  @Post('depreciation')
  async depRun(@CurrentUser() user: AuthenticatedUser, @Body() dto: PeriodDto) {
    const a = await this.actor(user);
    const { year, month } = parsePeriod(dto.period);
    return this.assets.run(a, a.rootId, year, month);
  }

  @Post('assets/:id/dispose')
  async dispose(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DisposeDto,
  ) {
    return this.assets.dispose(await this.actor(user), id, dto);
  }

  // ── budgets ──────────────────────────────────────────────────────────────

  @Get('budgets/:id')
  async budget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const a = await this.actor(user);
    const b = await this.budgets.mustBudget(a.rootId, id);
    return {
      ...b,
      months: await this.budgets.fyMonths(a.rootId, b.fiscalYear),
    };
  }

  @Post('budgets')
  async createBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BudgetDto,
  ) {
    return this.budgets.create(await this.actor(user), dto);
  }

  @Post('budgets/import')
  @UseInterceptors(fileUpload())
  async importBudget(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFileDecorator() file: UploadedFile,
    @Body() dto: BudgetImportDto,
  ) {
    if (!file)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Choose an XLSX or CSV file.',
        HttpStatus.BAD_REQUEST,
      );
    return this.budgets.importFile(await this.actor(user), file, dto);
  }

  @Post('budgets/:id/revise')
  async revise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.budgets.revise(await this.actor(user), id);
  }

  @Put('budgets/:id/line')
  async budgetLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: BudgetLineDto,
  ) {
    return this.budgets.setLine(await this.actor(user), id, dto);
  }

  @Post('budgets/:id/explain')
  async explain(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ExplainDto,
  ) {
    const a = await this.actor(user);
    const r = this.ledger.range(await this.ctx.config(a.rootId), dto.period);
    return this.budgets.explain(a, id, dto.accountId, r.from, r.to, dto.text);
  }

  @Post('budgets/:id/submit')
  async submitBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.budgets.submit(await this.actor(user), id);
  }

  @Post('budgets/:id/approve')
  async approveBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.budgets.approve(await this.actor(user), id);
  }

  @Post('budgets/:id/reject')
  async rejectBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.budgets.reject(await this.actor(user), id, dto.reason);
  }

  // ── close & periods ──────────────────────────────────────────────────────

  @Post('close/start')
  async startClose(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PeriodDto,
  ) {
    const { year, month } = parsePeriod(dto.period);
    const now = monthKey(new Date());
    if (year * 12 + month > now.year * 12 + now.month)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'That month hasn’t started yet.',
        HttpStatus.BAD_REQUEST,
      );
    return this.close.start(await this.actor(user), year, month);
  }

  @Post('close/tasks/:id/complete')
  async completeTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: NoteDto,
  ) {
    return this.close.complete(await this.actor(user), id, dto.note);
  }

  @Post('close/tasks/:id/reopen')
  async reopenTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.close.reopenTask(await this.actor(user), id);
  }

  @Post('close/tasks/:id/assign')
  async assignTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignDto,
  ) {
    return this.close.assign(await this.actor(user), id, dto.ownerUserId);
  }

  @Post('close/:runId/final')
  async finalApprove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId') runId: string,
  ) {
    return this.close.finalApprove(await this.actor(user), runId);
  }

  @Post('periods/:key/reopen')
  async reopenPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: ReasonDto,
  ) {
    const { year, month } = parsePeriod(key);
    return this.close.reopen(await this.actor(user), year, month, dto.reason);
  }

  @Post('periods/:key/lock')
  async lockPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
  ) {
    const { year, month } = parsePeriod(key);
    return this.close.lockPeriod(await this.actor(user), year, month);
  }

  // ── fx, settings, access ─────────────────────────────────────────────────

  @Post('fx/rates')
  async setRate(@CurrentUser() user: AuthenticatedUser, @Body() dto: RateDto) {
    return this.fx.setRate(await this.actor(user), dto);
  }

  @Get('fx/revaluation')
  async fxPreview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: FinScopeQuery,
  ) {
    const a = await this.actor(user);
    const { year, month } = parsePeriod(q.period ?? '');
    return this.fx.preview(a.rootId, year, month);
  }

  @Post('fx/revalue')
  async revalue(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PeriodDto,
  ) {
    const a = await this.actor(user);
    const { year, month } = parsePeriod(dto.period);
    return this.fx.revalue(a, a.rootId, year, month);
  }

  @Put('settings')
  async saveSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SettingsDto,
  ) {
    const patch = Object.fromEntries(
      Object.entries(dto.patch).filter(([k]) =>
        (CONFIG_KEYS as string[]).includes(k),
      ),
    ) as Partial<FinanceConfig>;
    return this.settings.save(await this.actor(user), dto.version, patch);
  }

  @Post('access/invite')
  async invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteDto) {
    return this.settings.invite(await this.actor(user), dto);
  }

  @Post('access/:id/revoke')
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.settings.revoke(await this.actor(user), id);
  }

  // ── files & exports ──────────────────────────────────────────────────────

  @Post('attach/:type/:id')
  @UseInterceptors(fileUpload())
  async attach(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @Param('id') id: string,
    @UploadedFileDecorator() file: UploadedFile,
  ) {
    if (!file)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Choose a file.',
        HttpStatus.BAD_REQUEST,
      );
    return this.docs.attach(await this.actor(user), type, id, file);
  }

  @Get('file')
  async file(@CurrentUser() user: AuthenticatedUser, @Query() q: KeyDto) {
    return this.docs.downloadUrl(await this.actor(user), q.key);
  }

  @Get('export/journal/:id')
  async exportJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() q: ExportQuery,
    @Res() res: Response,
  ) {
    this.send(
      res,
      await this.docs.exportJournal(
        await this.actor(user),
        id,
        q.format ?? 'csv',
      ),
    );
  }

  @Get('export/tax/:id')
  async exportTax(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() q: ExportQuery,
    @Res() res: Response,
  ) {
    this.send(
      res,
      await this.docs.exportTax(await this.actor(user), id, q.format ?? 'xlsx'),
    );
  }

  @Get('export/:key')
  async exportScreen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Query() q: ExportQuery,
    @Res() res: Response,
  ) {
    this.send(
      res,
      await this.docs.exportScreen(
        await this.actor(user),
        key,
        q.format ?? 'csv',
        q,
      ),
    );
  }
}
