import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { PayActor, PayContextService } from './pay-context.service';
import { PayApprovalsService } from './pay-approvals.service';
import {
  HIGH_RISK,
  PAY_ERRORS,
  PayPolicy,
  SECS,
  defaultPolicy,
  mergePolicy,
  parseIntervals,
} from './payments.constants';

/**
 * Versioned operational payment policy (Payments › Settings). Every save creates a new version and
 * an audit record. High-risk keys need a reason; when someone other than the Owner changes them the
 * change waits for the Owner in the Action Center instead of applying.
 */
@Injectable()
export class PayPolicyService {
  constructor(
    private readonly ctx: PayContextService,
    private readonly approvals: PayApprovalsService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  diff(a: PayPolicy, b: PayPolicy): string[] {
    const out: string[] = [];
    for (const [k] of SECS)
      for (const f of Object.keys({ ...(a[k] as object), ...(b[k] as object) }))
        if (
          JSON.stringify((a[k] as Record<string, unknown>)[f]) !==
          JSON.stringify((b[k] as Record<string, unknown>)[f])
        )
          out.push(`${k}.${f}`);
    return out;
  }

  private validate(p: PayPolicy) {
    const bad = (m: string) => {
      throw new AppException(PAY_ERRORS.INVALID, m, HttpStatus.BAD_REQUEST);
    };
    if (!(p.collection.minRequest > 0)) bad('Minimum request must be above 0.');
    if (p.collection.maxRequest < p.collection.minRequest)
      bad('Maximum request must be at least the minimum.');
    if (
      p.collection.requestExpiryDays < 1 ||
      p.collection.requestExpiryDays > 365
    )
      bad('Request expiry must be 1–365 days.');
    if (p.retry.maxAttempts < 1 || p.retry.maxAttempts > 8)
      bad('Max attempts must be 1–8.');
    if (!parseIntervals(p.retry.intervals).length)
      bad('Retry intervals look like “6h, 24h, 72h”.');
    if (!(p.refund.approvalAbove >= 0))
      bad('Owner approval threshold can’t be negative.');
    if (p.disputes.warnDays < 0 || p.disputes.warnDays > 30)
      bad('Dispute warning must be 0–30 days.');
    if (p.payout.delayHours < 1)
      bad('Payout delay alert must be at least 1 hour.');
    if (p.safeguards.testRetentionDays < 1)
      bad('Test data retention must be at least 1 day.');
  }

  async save(
    a: PayActor,
    version: number,
    patch: Partial<Record<keyof PayPolicy, Record<string, unknown>>>,
    reason?: string,
  ) {
    this.ctx.need(a, 'admin', 'Changing payment policy');
    const s = await this.ctx.ensure(a.rootId);
    if (s.policyVersion !== version)
      throw new AppException(
        PAY_ERRORS.VERSION_CONFLICT,
        `Someone saved policy v${s.policyVersion} since you opened it. Reload to see it before saving.`,
        HttpStatus.CONFLICT,
      );
    const cur = await this.ctx.policy(a.rootId);
    const biz = await this.ctx.business(a.rootId);
    const raw = JSON.parse(JSON.stringify(cur)) as Record<
      string,
      Record<string, unknown>
    >;
    for (const [k, v] of Object.entries(patch ?? {}))
      if (raw[k] && v) raw[k] = { ...raw[k], ...v };
    const next = mergePolicy(defaultPolicy(biz.currency), raw);
    this.validate(next);
    const changed = this.diff(cur, next);
    if (!changed.length)
      return { version: s.policyVersion, pending: false, changed };
    const risky = changed.filter((c) => HIGH_RISK.includes(c));
    if (risky.length && !reason?.trim())
      throw new AppException(
        PAY_ERRORS.INVALID,
        `High-risk change (${risky.join(', ')}) — give a reason.`,
        HttpStatus.BAD_REQUEST,
      );
    if (risky.length && a.role !== 'Owner') {
      await this.approvals.request(a.rootId, a, {
        kind: 'policy',
        subjectId: a.rootId,
        title: `Payment policy change · ${risky.join(', ')}`,
        rule: 'High-risk payment policy changes need the Owner',
        payload: {
          policy: next,
          changed,
          reason,
          baseVersion: s.policyVersion,
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'High-risk policy change sent for approval',
        'policy',
        a.rootId,
        `${risky.join(', ')} · ${reason}`,
      );
      return { version: s.policyVersion, pending: true, changed };
    }
    return this.apply(a, next, changed, reason ?? null, risky.length > 0);
  }

  private async apply(
    a: PayActor,
    next: PayPolicy,
    changed: string[],
    reason: string | null,
    highRisk: boolean,
  ) {
    const s = await this.db.paySettings.update({
      where: { businessId: a.rootId },
      data: {
        policy: next as unknown as Prisma.InputJsonValue,
        policyVersion: { increment: 1 },
      },
    });
    await this.db.payPolicyVersion.create({
      data: {
        businessId: a.rootId,
        version: s.policyVersion,
        policy: next as unknown as Prisma.InputJsonValue,
        changed,
        reason,
        highRisk,
        byId: a.userId,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      `Payment policy v${s.policyVersion} saved`,
      'policy',
      a.rootId,
      `${changed.join(', ')}${reason ? ` · ${reason}` : ''}`,
    );
    return { version: s.policyVersion, pending: false, changed };
  }

  async approvePending(a: PayActor, approvalId: string) {
    const ap = await this.approvals.decide(a, approvalId, true);
    const pl = ap.payload as unknown as {
      policy: PayPolicy;
      changed: string[];
      reason: string;
    };
    return this.apply(
      a,
      pl.policy,
      pl.changed,
      `${pl.reason} (approved by ${a.name})`,
      true,
    );
  }

  /** Runs sample scenarios against a (draft) policy. Nothing is saved or executed. */
  test(p: PayPolicy, scenario: string, role: string, currency: string): string {
    const amt = (x: number) => `${currency} ${x.toLocaleString('en-US')}`;
    switch (scenario) {
      case 'refund': {
        const v = p.refund.approvalAbove * 1.2;
        const allowed = role === 'Owner' || p.refund.roles.includes(role);
        return `Refund of ${amt(v)} by ${role}: ${allowed ? 'can execute' : 'cannot execute (role not allowed)'}; ${v > p.refund.approvalAbove ? `above ${amt(p.refund.approvalAbove)} → Owner approval in Action Center first` : 'no extra approval'}. Upstream approval in Orders is always required.`;
      }
      case 'retry':
        return `Soft decline after 3 attempts: ${3 < p.retry.maxAttempts ? `attempt 4 allowed (max ${p.retry.maxAttempts}), next after ${parseIntervals(p.retry.intervals)[2] ?? parseIntervals(p.retry.intervals).slice(-1)[0]} min` : `stopped — ${p.retry.pauseAfter}`}. Retries need a saved method (subscriptions).`;
      case 'hard':
        return 'Hard decline: never retried — the customer is asked for a new payment method. (Fixed rule.)';
      case 'dispute': {
        const v = p.disputes.submitApprovalAbove * 1.5;
        return `Dispute response for ${amt(v)} by ${role}: ${v > p.disputes.submitApprovalAbove && role !== 'Owner' ? 'needs Owner approval before it is submitted' : 'can be submitted'}. AI never submits.`;
      }
      case 'request':
        return `Payment request for ${amt(p.collection.minRequest / 2)}: rejected — below the ${amt(p.collection.minRequest)} minimum. Requests expire after ${p.collection.requestExpiryDays} days by default.`;
      default:
        return 'Pick a scenario.';
    }
  }
}
