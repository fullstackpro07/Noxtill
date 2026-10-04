import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { PayActor, PayContextService } from './pay-context.service';
import { parseScope } from './pay-data.service';
import { PayViewsService } from './pay-views.service';
import { PayDrawersService } from './pay-drawers.service';
import { PayRequestsService } from './pay-requests.service';
import { PayRefundsService } from './pay-refunds.service';
import { PayRecoveryService } from './pay-recovery.service';
import { PayDisputesService } from './pay-disputes.service';
import { PayRecurringService } from './pay-recurring.service';
import { PayRoutingService } from './pay-routing.service';
import { PayReconService } from './pay-recon.service';
import { PayPolicyService } from './pay-policy.service';
import { PayApprovalsService } from './pay-approvals.service';
import { PayApplyService } from './pay-apply.service';
import { PayDocsService } from './pay-docs.service';
import { PayStripeService } from './pay-stripe.service';
import {
  PAY_ERRORS,
  PayEnv,
  defaultPolicy,
  mergePolicy,
} from './payments.constants';
import {
  AdjustDto,
  AmountDto,
  AssignDto,
  CreateRequestDto,
  DecideDto,
  EvidenceDto,
  ImpactDto,
  MatchDto,
  MethodDto,
  NotifyDto,
  PayExportQuery,
  PayLinkOptionsQuery,
  PayReasonDto,
  PayScopeQuery,
  PolicySaveDto,
  PolicyTestDto,
  PublicCheckoutDto,
  RecordPaymentDto,
  RouteTestDto,
  RuleActionDto,
  RuleDto,
  SavedViewDto,
  SendRequestDto,
  SplitDto,
  SubmitDisputeDto,
} from './dto/payments.dto';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly ctx: PayContextService,
    private readonly views: PayViewsService,
    private readonly drawers: PayDrawersService,
    private readonly requests: PayRequestsService,
    private readonly refunds: PayRefundsService,
    private readonly recovery: PayRecoveryService,
    private readonly disputes: PayDisputesService,
    private readonly recurring: PayRecurringService,
    private readonly routing: PayRoutingService,
    private readonly recon: PayReconService,
    private readonly policy: PayPolicyService,
    private readonly approvals: PayApprovalsService,
    private readonly apply: PayApplyService,
    private readonly docs: PayDocsService,
    private readonly stripe: PayStripeService,
  ) {}

  private actor(u: AuthenticatedUser) {
    return this.ctx.actor(u);
  }

  /** Live money actions need an explicit confirmation when the policy says so. */
  private async live(a: PayActor, env: string, confirmed?: boolean) {
    if (env !== 'live') return;
    const pol = await this.ctx.policy(a.rootId);
    if (pol.safeguards.liveConfirm && !confirmed)
      throw new AppException(
        PAY_ERRORS.LIVE_CONFIRM_REQUIRED,
        'LIVE — confirm that this moves real money.',
        HttpStatus.BAD_REQUEST,
      );
  }

  // ── reads ────────────────────────────────────────────────────────────────

  @Get('boot')
  async boot(@CurrentUser() u: AuthenticatedUser) {
    const a = await this.actor(u);
    await this.ctx.ensure(a.rootId);
    const biz = await this.ctx.business(a.rootId);
    const branches = (await this.ctx.branches(a.rootId))
      .filter((b) => !a.branches || a.branches.includes(b.id))
      .map((b) => ({
        id: b.id,
        name: b.name,
        currency: b.currency,
        country: b.country,
      }));
    const conns = await this.stripe.connections(a.rootId);
    const pol = await this.ctx.policy(a.rootId);
    return {
      actor: {
        name: a.name,
        role: a.role,
        roleLabel: a.roleLabel,
        request: a.request,
        recover: a.recover,
        refund: a.refund,
        dispute: a.dispute,
        recon: a.recon,
        approve: a.approve,
        admin: a.admin,
        fees: a.fees,
        pii: a.pii,
        export: a.export,
        raw: a.raw,
      },
      business: {
        name: biz.name,
        currency: biz.currency,
        country: biz.country,
        timezone: biz.timezone,
      },
      branches,
      members: a.dispute || a.admin ? await this.ctx.members(a.rootId) : [],
      connections: conns.map((c) => ({
        provider: c.provider,
        env: c.env,
        status: c.status,
        writeEnabled: c.writeEnabled,
        country: c.country,
        currency: c.defaultCurrency,
      })),
      policy: {
        liveConfirm: pol.safeguards.liveConfirm,
        partialPayments: pol.collection.partialPayments,
        minRequest: pol.collection.minRequest,
        maxRequest: pol.collection.maxRequest,
        requestExpiryDays: pol.collection.requestExpiryDays,
        approvalAbove: pol.refund.approvalAbove,
        submitApprovalAbove: pol.disputes.submitApprovalAbove,
      },
    };
  }

  @Get('screen')
  async screen(@CurrentUser() u: AuthenticatedUser, @Query() q: PayScopeQuery) {
    return this.views.screen(
      await this.actor(u),
      parseScope(q as Record<string, unknown>),
    );
  }

  @Get('drawer/:kind/:id')
  async drawer(
    @CurrentUser() u: AuthenticatedUser,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Query() q: PayScopeQuery,
  ) {
    return this.drawers.drawer(
      await this.actor(u),
      parseScope(q as Record<string, unknown>),
      kind,
      id,
    );
  }

  @Post('refresh')
  async refresh(@CurrentUser() u: AuthenticatedUser) {
    const a = await this.actor(u);
    return this.apply.syncGroup(a.rootId);
  }

  @Get('customers')
  async customers(@CurrentUser() u: AuthenticatedUser, @Query('q') q?: string) {
    const a = await this.actor(u);
    this.ctx.need(a, 'request', 'Looking up customers');
    const group = (await this.ctx.branches(a.rootId)).map((b) => b.id);
    const term = (q ?? '').trim().slice(0, 60);
    const rows = await this.ctx.db.customer.findMany({
      where: {
        businessId: { in: group },
        ...(term
          ? {
              OR: [
                { name: { contains: term } },
                { phone: { contains: term } },
                { email: { contains: term } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, phone: true, email: true, tags: true },
      orderBy: { lastVisitAt: 'desc' },
      take: 30,
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      tags: Array.isArray(c.tags) ? c.tags : [],
      hasPhone: !!c.phone,
      hasEmail: !!c.email,
    }));
  }

  @Get('export')
  async export(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: PayExportQuery,
    @Res() res: Response,
  ) {
    const f = await this.docs.export(
      await this.actor(u),
      parseScope(q as Record<string, unknown>),
      q.what ?? 'transactions',
      q.format ?? 'csv',
      {
        ids: q.ids ? q.ids.split(',').filter(Boolean) : undefined,
        full: q.full === '1',
        payout: q.payout,
      },
    );
    res.setHeader('Content-Type', f.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${f.fileName}"`,
    );
    res.setHeader('X-Row-Count', String(f.rows));
    res.send(f.body);
  }

  // ── transactions ─────────────────────────────────────────────────────────

  @Post('tx/:id/refresh')
  async txRefresh(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const a = await this.actor(u);
    const r = await this.apply.refreshTx(a.rootId, id);
    if (!r)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Transaction not found',
        HttpStatus.NOT_FOUND,
      );
    return r;
  }

  @Post('tx/:id/capture')
  async capture(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AmountDto,
  ) {
    const a = await this.actor(u);
    this.ctx.need(a, 'refund', 'Capturing a payment');
    const t = await this.ctx.db.payTransaction.findFirst({
      where: { id, businessId: a.rootId },
    });
    if (!t)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Transaction not found',
        HttpStatus.NOT_FOUND,
      );
    await this.live(a, t.env, b.liveConfirm);
    const r = await this.apply.capture(
      a.rootId,
      a as unknown as { userId: string; name: string },
      id,
      b.amount ?? null,
    );
    await this.ctx.audit(
      a.rootId,
      a,
      'Capture requested',
      'tx',
      id,
      `${t.number} · ${r.note}`,
      t.correlationId,
    );
    return r;
  }

  @Post('tx/:id/receipt')
  async receipt(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    const a = await this.actor(u);
    this.ctx.need(a, 'request', 'Sending a receipt');
    const t = await this.ctx.db.payTransaction.findFirst({
      where: { id, businessId: a.rootId },
    });
    if (!t || t.status !== 'Succeeded' || !t.customerId)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Receipts go to a customer for a successful payment.',
        HttpStatus.BAD_REQUEST,
      );
    const r = await this.apply.receipt(a.rootId, t);
    if (!r.message)
      throw new AppException(
        PAY_ERRORS.INVALID,
        `Not sent — ${r.error}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    return { channel: r.channel };
  }

  // ── payment requests ─────────────────────────────────────────────────────

  @Get('requests/link-options')
  async linkOptions(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: PayLinkOptionsQuery,
  ) {
    const a = await this.actor(u);
    return this.requests.linkOptions(a.rootId, q.customer);
  }

  @Get('requests/methods')
  async reqMethods(
    @CurrentUser() u: AuthenticatedUser,
    @Query('env') env: string,
    @Query('currency') currency: string,
  ) {
    const a = await this.actor(u);
    return this.requests.allowedMethods(
      a.rootId,
      this.ctx.env(env),
      (currency || (await this.ctx.business(a.rootId)).currency).slice(0, 3),
    );
  }

  @Post('requests')
  async createRequest(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: CreateRequestDto,
  ) {
    const a = await this.actor(u);
    const r = await this.requests.create(a, {
      ...b,
      linkType: b.linkType || null,
    });
    return {
      id: r.id,
      number: r.number,
      status: r.status,
      url: this.requests.url(r),
    };
  }

  @Get('requests/:id/link')
  async link(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    const a = await this.actor(u);
    const r = await this.requests.mustRequest(a.rootId, id);
    return { url: this.requests.url(r), status: r.status };
  }

  @Get('requests/:id/duplicate')
  async dup(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.requests.duplicate(await this.actor(u), id);
  }

  @Post('requests/:id/send')
  async sendRequest(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: SendRequestDto,
  ) {
    return this.requests.send(await this.actor(u), id, b.channel);
  }

  @Post('requests/:id/expire')
  async expire(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: PayReasonDto,
  ) {
    await this.requests.expire(await this.actor(u), id, b.reason);
    return { ok: true };
  }

  @Post('requests/:id/record')
  async record(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: RecordPaymentDto,
  ) {
    const t = await this.requests.recordManual(await this.actor(u), id, b);
    return { number: t.number };
  }

  // ── recovery ─────────────────────────────────────────────────────────────

  @Get('recovery/:id/draft')
  async draft(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Query('method') method?: string,
  ) {
    return this.recovery.draft(await this.actor(u), id, method === '1');
  }

  @Post('recovery/:id/retry')
  async retry(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AmountDto,
  ) {
    const a = await this.actor(u);
    const c = await this.recovery.must(a.rootId, id);
    const t = await this.ctx.db.payTransaction.findUniqueOrThrow({
      where: { id: c.txId },
    });
    await this.live(a, t.env, b.liveConfirm);
    return this.recovery.retry(a, id);
  }

  @Post('recovery/:id/notify')
  async notify(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: NotifyDto,
  ) {
    const a = await this.actor(u);
    return this.recovery.notify(a, a.rootId, id, {
      channel: b.channel,
      text: b.text,
      method: !!b.method,
    });
  }

  @Post('recovery/:id/:op')
  async recoveryOp(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('op') op: string,
    @Body() b: PayReasonDto,
  ) {
    const a = await this.actor(u);
    if (op === 'pause' || op === 'resume')
      await this.recovery.setPaused(a, id, op === 'pause');
    else if (op === 'unrecoverable') {
      if (!b.reason?.trim())
        throw new AppException(
          PAY_ERRORS.INVALID,
          'Give a reason.',
          HttpStatus.BAD_REQUEST,
        );
      await this.recovery.markUnrecoverable(a, id, b.reason);
    } else
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Unknown action',
        HttpStatus.NOT_FOUND,
      );
    return { ok: true };
  }

  // ── refunds ──────────────────────────────────────────────────────────────

  @Post('refunds/:id/execute')
  async execute(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AmountDto,
  ) {
    const a = await this.actor(u);
    const r = await this.refunds.must(a.rootId, id);
    await this.live(a, r.env, b.liveConfirm);
    const out = await this.refunds.execute(a, id, b.amount ?? null);
    return { status: out.status, number: out.number, failure: out.failureCode };
  }

  @Post('refunds/:id/approve')
  async approveRefund(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AmountDto,
  ) {
    const a = await this.actor(u);
    const r = await this.refunds.must(a.rootId, id);
    await this.live(a, r.env, b.liveConfirm);
    await this.refunds.approve(a, id);
    const out = await this.refunds.execute(a, id, null);
    return { status: out.status, number: out.number, failure: out.failureCode };
  }

  @Post('refunds/:id/refresh')
  async refreshRefund(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const a = await this.actor(u);
    const r = await this.refunds.refresh(a.rootId, id, a);
    return { status: r.status };
  }

  @Post('refunds/:id/outside')
  async outside(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: PayReasonDto,
  ) {
    if (!b.reason?.trim())
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Give the payout reference.',
        HttpStatus.BAD_REQUEST,
      );
    const r = await this.refunds.markOutside(await this.actor(u), id, b.reason);
    return { status: r.status };
  }

  // ── disputes ─────────────────────────────────────────────────────────────

  @Get('disputes/:id/candidates')
  async candidates(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const a = await this.actor(u);
    const d = await this.disputes.must(a.rootId, id);
    const ev = await this.ctx.db.payDisputeEvidence.findMany({
      where: { disputeId: d.id },
    });
    const c = await this.disputes.candidates(a.rootId, d);
    return {
      available: c
        .filter(
          (x) =>
            !ev.some(
              (e) => e.entityId === x.entityId && e.status !== 'Missing',
            ),
        )
        .map((x) => ({
          key: `${x.entityType}:${x.entityId}`,
          label: `${x.module} · ${x.label}`,
        })),
      missing: ev
        .filter(
          (e) =>
            e.status === 'Missing' &&
            !c.some((x) => x.entityType === e.entityType),
        )
        .map((e) => e.label),
      response: d.response ?? d.draft ?? '',
      missingRequired: ev
        .filter((e) => e.requirement === 'Required' && e.status === 'Missing')
        .map((e) => e.label),
    };
  }

  @Post('disputes/:id/evidence')
  async evidence(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: EvidenceDto,
  ) {
    return {
      added: await this.disputes.addEvidence(await this.actor(u), id, b.keys),
    };
  }

  @Post('disputes/:id/draft')
  async dDraft(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.disputes.draft(await this.actor(u), id);
  }

  @Post('disputes/:id/submit')
  async submit(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: SubmitDisputeDto,
  ) {
    const a = await this.actor(u);
    const d = await this.disputes.must(a.rootId, id);
    await this.live(a, d.env, b.liveConfirm);
    return this.disputes.submit(a, id, b.response, !!b.acceptWeaker);
  }

  @Post('disputes/:id/approve')
  async approveDispute(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AmountDto,
  ) {
    const a = await this.actor(u);
    const d = await this.disputes.must(a.rootId, id);
    await this.live(a, d.env, b.liveConfirm);
    return this.disputes.approveSubmission(a, id);
  }

  @Post('disputes/:id/accept')
  async accept(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: PayReasonDto & AmountDto,
  ) {
    const a = await this.actor(u);
    const d = await this.disputes.must(a.rootId, id);
    await this.live(a, d.env, (b as AmountDto).liveConfirm);
    if (!b.reason?.trim())
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Give a reason.',
        HttpStatus.BAD_REQUEST,
      );
    await this.disputes.accept(a, id, b.reason);
    return { ok: true };
  }

  @Post('disputes/:id/assign')
  async assign(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AssignDto,
  ) {
    await this.disputes.assign(await this.actor(u), id, b.userId);
    return { ok: true };
  }

  // ── mandates ─────────────────────────────────────────────────────────────

  @Post('mandates/:id/:op')
  async mandate(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('op') op: string,
    @Body() b: PayReasonDto & AmountDto,
  ) {
    const a = await this.actor(u);
    const m = await this.recurring.must(a.rootId, id);
    if (op === 'pause' || op === 'resume')
      await this.recurring.pause(a, id, op === 'pause');
    else if (op === 'cancel') {
      if (!b.reason?.trim())
        throw new AppException(
          PAY_ERRORS.INVALID,
          'Give a reason.',
          HttpStatus.BAD_REQUEST,
        );
      await this.recurring.cancel(a, id, b.reason);
    } else if (op === 'retry') {
      await this.live(a, m.env, (b as AmountDto).liveConfirm);
      return this.recurring.retry(a, id);
    } else if (op === 'method') {
      const tx = await this.ctx.db.payTransaction.findFirst({
        where: { mandateId: id, status: 'Failed' },
        orderBy: { occurredAt: 'desc' },
      });
      const c = tx
        ? await this.ctx.db.payRecoveryCase.findUnique({
            where: { txId: tx.id },
          })
        : null;
      if (!c)
        throw new AppException(
          PAY_ERRORS.CONFLICT,
          'There is no failed collection for this mandate.',
          HttpStatus.CONFLICT,
        );
      return this.recovery.notify(a, a.rootId, c.id, { method: true });
    } else
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Unknown action',
        HttpStatus.NOT_FOUND,
      );
    return { ok: true };
  }

  // ── routing ──────────────────────────────────────────────────────────────

  @Post('routing/methods/:method')
  async method(
    @CurrentUser() u: AuthenticatedUser,
    @Param('method') method: string,
    @Body() b: MethodDto,
  ) {
    return this.routing.setMethod(await this.actor(u), method, {
      ...b,
      primary: b.primary === undefined ? undefined : b.primary || null,
      fallback: b.fallback === undefined ? undefined : b.fallback || null,
    });
  }

  @Post('routing/rules')
  async rule(@CurrentUser() u: AuthenticatedUser, @Body() b: RuleDto) {
    return this.routing.saveRule(await this.actor(u), null, b);
  }

  @Put('routing/rules/:id')
  async editRule(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: RuleDto,
  ) {
    return this.routing.saveRule(await this.actor(u), id, b);
  }

  @Get('routing/rules/:id')
  async getRule(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    const a = await this.actor(u);
    const r = await this.ctx.db.payRoutingRule.findFirst({
      where: { id, businessId: a.rootId },
    });
    if (!r)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Rule not found',
        HttpStatus.NOT_FOUND,
      );
    return r;
  }

  @Post('routing/rules/:id/action')
  async ruleAction(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: RuleActionDto,
  ) {
    await this.routing.ruleAction(await this.actor(u), id, b.action);
    return { ok: true };
  }

  @Post('routing/test')
  async test(@CurrentUser() u: AuthenticatedUser, @Body() b: RouteTestDto) {
    const a = await this.actor(u);
    return this.routing.evaluate(a.rootId, {
      ...b,
      branch: b.branch ?? a.rootId,
    });
  }

  @Post('routing/impact')
  async impact(@CurrentUser() u: AuthenticatedUser, @Body() b: ImpactDto) {
    const a = await this.actor(u);
    return this.routing.impact(a.rootId, b);
  }

  // ── reconciliation ───────────────────────────────────────────────────────

  @Post('recon/auto')
  async auto(@CurrentUser() u: AuthenticatedUser) {
    const a = await this.actor(u);
    this.ctx.need(a, 'recon', 'Running auto match');
    return this.recon.autoMatch(a.rootId);
  }

  @Get('recon/:id/candidates')
  async reconCands(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const a = await this.actor(u);
    const r = await this.recon.must(a.rootId, id);
    const list = await this.recon.candidates(a.rootId, r);
    return list.map((x) => ({
      id: x.t.id,
      number: x.t.number,
      amount: Number(x.t.captured),
      currency: x.t.currency,
      at: x.t.occurredAt,
      conf: x.conf,
    }));
  }

  @Post('recon/:id/match')
  async match(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: MatchDto,
  ) {
    await this.recon.match(
      await this.actor(u),
      id,
      b.txId,
      b.reason,
      !!b.confirmLow,
    );
    return { ok: true };
  }

  @Post('recon/:id/split')
  async split(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: SplitDto,
  ) {
    await this.recon.split(await this.actor(u), id, b.txIds, b.reason);
    return { ok: true };
  }

  @Post('recon/:id/adjust')
  async adjust(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: AdjustDto,
  ) {
    await this.recon.adjust(await this.actor(u), id, b.type, b.reason);
    return { ok: true };
  }

  @Post('recon/:id/finance')
  async finance(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: PayReasonDto,
  ) {
    await this.recon.flagFinance(
      await this.actor(u),
      id,
      b.reason || 'Needs accounting review',
    );
    return { ok: true };
  }

  @Post('recon/:id/ignore')
  async ignore(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: PayReasonDto,
  ) {
    if (!b.reason?.trim())
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Give a reason.',
        HttpStatus.BAD_REQUEST,
      );
    await this.recon.ignore(await this.actor(u), id, b.reason);
    return { ok: true };
  }

  // ── settings ─────────────────────────────────────────────────────────────

  @Put('settings')
  async save(@CurrentUser() u: AuthenticatedUser, @Body() b: PolicySaveDto) {
    return this.policy.save(await this.actor(u), b.version, b.patch, b.reason);
  }

  @Post('settings/test')
  async policyTest(
    @CurrentUser() u: AuthenticatedUser,
    @Body() b: PolicyTestDto,
  ) {
    const a = await this.actor(u);
    const biz = await this.ctx.business(a.rootId);
    const cur = await this.ctx.policy(a.rootId);
    const raw = JSON.parse(JSON.stringify(cur)) as Record<
      string,
      Record<string, unknown>
    >;
    for (const [k, v] of Object.entries(b.draft ?? {}))
      if (raw[k]) raw[k] = { ...raw[k], ...v };
    return {
      result: this.policy.test(
        mergePolicy(defaultPolicy(biz.currency), raw),
        b.scenario,
        a.role,
        biz.currency,
      ),
    };
  }

  // ── approvals, views ─────────────────────────────────────────────────────

  @Post('approvals/:id')
  async decide(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() b: DecideDto,
  ) {
    const a = await this.actor(u);
    const ap = await this.ctx.db.payApproval.findFirst({
      where: { id, businessId: a.rootId },
    });
    if (!ap)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Approval not found',
        HttpStatus.NOT_FOUND,
      );
    if (!b.approve) {
      await this.approvals.decide(a, id, false, b.comment);
      if (ap.kind === 'refund')
        await this.ctx.db.payRefund.updateMany({
          where: { id: ap.subjectId, status: 'Approval Required' },
          data: {
            status: 'Manual Review',
            failureCode: `Owner declined execution${b.comment ? `: ${b.comment}` : ''}`,
          },
        });
      if (ap.kind === 'dispute')
        await this.ctx.db.payDispute.updateMany({
          where: { id: ap.subjectId, status: 'Approval Required' },
          data: { status: 'Needs Response' },
        });
      return { ok: true };
    }
    if (ap.kind === 'refund') {
      await this.refunds.approve(a, ap.subjectId, b.comment);
      const r = await this.refunds
        .execute(a, ap.subjectId, null)
        .catch((e: Error) => ({ status: 'Ready', failureCode: e.message }));
      return { ok: true, status: r.status };
    }
    if (ap.kind === 'dispute')
      return this.disputes.approveSubmission(a, ap.subjectId);
    if (ap.kind === 'policy') return this.policy.approvePending(a, id);
    return { ok: false };
  }

  @Post('views')
  async saveView(@CurrentUser() u: AuthenticatedUser, @Body() b: SavedViewDto) {
    const a = await this.actor(u);
    return this.ctx.db.paySavedView.upsert({
      where: {
        businessId_userId_name: {
          businessId: a.rootId,
          userId: a.userId,
          name: b.name,
        },
      },
      create: {
        businessId: a.rootId,
        userId: a.userId,
        name: b.name,
        filters: b.filters as Prisma.InputJsonValue,
      },
      update: { filters: b.filters as Prisma.InputJsonValue },
    });
  }

  @Get('views/:id')
  async view(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    const a = await this.actor(u);
    const v = await this.ctx.db.paySavedView.findFirst({
      where: { id, businessId: a.rootId, userId: a.userId },
    });
    if (!v)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'View not found',
        HttpStatus.NOT_FOUND,
      );
    return v;
  }

  @Delete('views/:id')
  async delView(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    const a = await this.actor(u);
    await this.ctx.db.paySavedView.deleteMany({
      where: { id, businessId: a.rootId, userId: a.userId },
    });
    return { ok: true };
  }
}

/** The customer-facing pay page. Only the opaque token identifies a request. */
@Controller('public/pay')
export class PayPublicController {
  constructor(private readonly requests: PayRequestsService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token')
  view(@Param('token') token: string) {
    return this.requests.publicView(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token/viewed')
  async viewed(@Param('token') token: string) {
    await this.requests.publicViewed(token);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token/checkout')
  checkout(@Param('token') token: string, @Body() b: PublicCheckoutDto) {
    return this.requests.publicCheckout(token, b.amount ?? null);
  }
}

export type { PayEnv };
