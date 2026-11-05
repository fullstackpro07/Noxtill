import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { Prisma } from '@prisma/client';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { PrismaService } from '../prisma/prisma.service';
import {
  EntitlementsService,
  SubscriptionWithPlan,
} from './entitlements.service';
import { RemediesService } from './remedies.service';
import { CapGroup, MetricCode, USAGE_ERROR_CODES } from './usage.constants';
import { formatDateUtc, usageWindow } from './usage-period.util';

export interface RecordInput {
  businessId: string;
  metricCode: string;
  quantity: number;
  unit: string;
  idempotencyKey: string;
  operationCode?: string | null;
  costUsd?: number | null;
  priceUsd?: number | null;
  provider?: string | null;
  providerRef?: string | null;
  countryCode?: string | null;
  status?: string;
  actorUserId?: string | null;
  branchId?: string | null;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}

const PRICE_TTL_MS = 5 * 60 * 1000;

/** GSM-7 basic set; anything outside it forces UCS-2 encoding (70/67 chars per segment). */
const GSM7 =
  /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;

export function smsSegments(text: string): number {
  if (!text) return 1;
  const gsm = GSM7.test(text);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

export function countryOf(phone: string | null | undefined): string | null {
  if (!phone) return null;
  try {
    return parsePhoneNumberFromString(phone)?.country ?? null;
  } catch {
    return null;
  }
}

/**
 * Metered services other than credits (spec §5): the append-only event writer, capacity and
 * feature checks, and spend-cap holds for pass-through metrics. A hold's availability check and
 * its `reserved_usd +=` are one conditional UPDATE against the customer's cap, so a cap is never
 * exceeded by a NEW operation; operations already in flight settle at their real cost (spec §5.5).
 */
@Injectable()
export class MetersService {
  private readonly logger = new Logger(MetersService.name);
  private priceCache: {
    at: number;
    rows: {
      metricCode: string;
      countryCode: string;
      numberType: string;
      unitPriceUsd: number;
      per: number;
    }[];
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly remedies: RemediesService,
  ) {}

  /** Append-only. Returns false when the idempotency key was already recorded (duplicate webhook, retry). */
  async record(
    input: RecordInput,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    const rootId = await this.entitlements.rootId(input.businessId);
    // Our provider cost (spec §17.1 margin tracking), from the last fetched provider price list.
    let costUsd = input.costUsd;
    if (costUsd === undefined && input.provider) {
      const cost = await this.prisma.providerCost.findFirst({
        where: {
          provider: input.provider,
          metricCode: input.metricCode,
          countryCode: input.countryCode ?? '',
        },
        orderBy: { fetchedAt: 'desc' },
      });
      costUsd = cost ? Number(cost.unitCostUsd) * input.quantity : null;
    }
    try {
      await tx.usageEvent.create({
        data: {
          businessId: rootId,
          branchId:
            input.branchId ??
            (input.businessId !== rootId ? input.businessId : null),
          actorUserId: input.actorUserId ?? null,
          metricCode: input.metricCode,
          operationCode: input.operationCode ?? null,
          quantity: input.quantity,
          unit: input.unit,
          costUsd: costUsd ?? null,
          priceUsd: input.priceUsd ?? null,
          provider: input.provider ?? null,
          providerRef: input.providerRef ?? null,
          countryCode: input.countryCode ?? null,
          status: input.status ?? 'completed',
          idempotencyKey: input.idempotencyKey,
          occurredAt: input.occurredAt ?? new Date(),
          metadata: (input.metadata ?? undefined) as
            Prisma.InputJsonValue | undefined,
        },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return false;
      throw error;
    }
  }

  async prices() {
    if (this.priceCache && Date.now() - this.priceCache.at < PRICE_TTL_MS)
      return this.priceCache.rows;
    const rows = await this.prisma.meterPrice.findMany({
      orderBy: { effectiveFrom: 'desc' },
    });
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const key = `${r.metricCode}|${r.countryCode}|${r.numberType}`;
      if (!latest.has(key) && r.effectiveFrom <= new Date()) latest.set(key, r);
    }
    const out = [...latest.values()].map((r) => ({
      metricCode: r.metricCode,
      countryCode: r.countryCode,
      numberType: r.numberType,
      unitPriceUsd: Number(r.unitPriceUsd),
      per: r.per,
    }));
    this.priceCache = { at: Date.now(), rows: out };
    return out;
  }

  /** Price per ONE unit, or null when no price is published for that metric/country. */
  async unitPrice(
    metricCode: string,
    countryCode?: string | null,
    numberType?: string,
  ): Promise<number | null> {
    const rows = await this.prices();
    const match =
      rows.find(
        (r) =>
          r.metricCode === metricCode &&
          r.countryCode === (countryCode ?? '') &&
          (numberType == null || r.numberType === numberType),
      ) ??
      (countryCode
        ? null
        : rows.find(
            (r) =>
              r.metricCode === metricCode &&
              (numberType == null || r.numberType === numberType),
          ));
    return match ? match.unitPriceUsd / match.per : null;
  }

  private ctx(sub: SubscriptionWithPlan, metric: string) {
    return {
      planKey: sub.plan.key,
      included: this.entitlements.includedFor(sub, metric),
      trialing: sub.status === 'trialing',
    };
  }

  /** CP-01..06: refuse a NEW user/location/number/agent seat at the limit. Existing ones keep working. */
  async assertCapacity(
    businessId: string,
    metric: MetricCode,
    adding = 1,
  ): Promise<void> {
    const rootId = await this.entitlements.rootId(businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);
    const set = await this.entitlements.resolve(rootId, { fresh: true });
    const m = set.metrics[metric];
    if (!m) return;
    const ctx = this.ctx(sub, metric);
    const label =
      metric === 'users'
        ? 'users'
        : metric === 'locations'
          ? 'locations'
          : metric.replace(/_/g, ' ');
    if (set.suspended) {
      await this.remedies.throwLimit(
        USAGE_ERROR_CODES.SUBSCRIPTION_PAUSED,
        'Your workspace is read-only until the subscription is active again.',
        metric,
        ctx,
        {
          remedies: [
            { type: 'add_payment_method', label: 'Update payment method' },
          ],
        },
      );
    }
    if (
      sub.status === 'trialing' &&
      ['phone_numbers_local', 'phone_numbers_tollfree', 'agent_seats'].includes(
        metric,
      )
    ) {
      await this.remedies.throwLimit(
        USAGE_ERROR_CODES.TRIAL_METERED_DISABLED,
        'Phone numbers and agent seats are not available during the free trial. Choose a plan to add them.',
        metric,
        ctx,
        {
          remedies: [
            { type: 'upgrade', label: 'Choose a plan', target: 'growth' },
          ],
        },
      );
    }
    if (m.included == null) {
      if (!m.enforced) return;
      await this.remedies.throwLimit(
        USAGE_ERROR_CODES.METRIC_NOT_CONFIGURED,
        `The ${label} allowance for your plan isn't confirmed yet, so adding more is paused.`,
        metric,
        ctx,
      );
    }
    const limit = (m.included ?? 0) + m.purchased;
    if (m.used + adding > limit) {
      const price = await this.unitPrice(metric);
      await this.remedies.throwLimit(
        USAGE_ERROR_CODES.CAPACITY_REACHED,
        limit === 0
          ? `Your ${set.planName} plan doesn't include ${label}.${price != null ? ` Add one for $${price.toFixed(2)}/month.` : ''}`
          : `Your ${set.planName} plan includes ${limit} ${label} and you're using ${m.used}.${price != null ? ` Add one for $${price.toFixed(2)}/month or upgrade.` : ' Upgrade to add more.'}`,
        metric,
        ctx,
        { remaining: Math.max(0, limit - m.used) },
      );
    }
  }

  /**
   * Allowance meters whose per-plan numbers are still unset (automation runs, digitizer pages,
   * SEO keywords, eSign transactions, storage) are counted but not blocked; the moment a number
   * is set in `plan_entitlements`, this starts refusing at the limit with no code change.
   */
  async assertAllowance(
    businessId: string,
    metric: MetricCode,
    adding = 1,
  ): Promise<void> {
    const rootId = await this.entitlements.rootId(businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);
    // Cheap exit first (this sits on hot paths like workflow runs): nothing to enforce while the
    // plan has no number for this meter and the meter is counted-only.
    if (this.entitlements.includedFor(sub, metric) == null) {
      const def = await this.prisma.meterDefinition.findUnique({
        where: { metricCode: metric },
        select: { enforced: true },
      });
      if (!def?.enforced) return;
    }
    const set = await this.entitlements.resolve(rootId, { fresh: true });
    const m = set.metrics[metric];
    if (!m) return;
    if (m.included == null) {
      if (!m.enforced) return;
      await this.remedies.throwLimit(
        USAGE_ERROR_CODES.METRIC_NOT_CONFIGURED,
        'Allowance not confirmed yet. Usage is paused and nothing is charged.',
        metric,
        this.ctx(sub, metric),
      );
    }
    const limit = (m.included ?? 0) + m.purchased;
    if (m.used + adding > limit) {
      await this.remedies.throwLimit(
        USAGE_ERROR_CODES.ALLOWANCE_EXHAUSTED,
        `You have used all ${limit.toLocaleString('en-US')} included for this period.`,
        metric,
        this.ctx(sub, metric),
        { remaining: Math.max(0, limit - m.used), resetsAt: m.resetsAt },
      );
    }
  }

  async assertFeature(businessId: string, feature: MetricCode): Promise<void> {
    const rootId = await this.entitlements.rootId(businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);
    const included = this.entitlements.includedFor(sub, feature);
    if (included != null && included > 0) return;
    const name =
      (
        await this.prisma.meterDefinition.findUnique({
          where: { metricCode: feature },
        })
      )?.displayName ?? feature;
    const plans = await this.prisma.plan.findMany({
      where: {
        status: 'active',
        purchasable: true,
        displayOrder: { gt: 0 },
        entitlements: {
          some: { metricCode: feature, includedQuantity: { gt: 0 } },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });
    await this.remedies.throwLimit(
      USAGE_ERROR_CODES.FEATURE_NOT_IN_PLAN,
      included == null
        ? `${name} isn't confirmed for ${sub.plan.name} yet. Nothing runs or is charged until it is.`
        : `${name} isn't included in ${sub.plan.name}.${plans.length ? ` ${plans.map((p) => p.name).join(', ')} include${plans.length === 1 ? 's' : ''} it.` : ''}`,
      feature,
      this.ctx(sub, feature),
      {
        remedies: plans.map((p) => ({
          type: 'upgrade' as const,
          label: p.name,
          target: p.key,
        })),
      },
    );
  }

  /**
   * TR-02/03 + dunning day 8: metered pass-through services are off during a trial (a card-less
   * trial with live SMS/voice is a fraud route — spec §15.1) and while a payment is badly overdue.
   */
  async assertMeteredAllowed(
    businessId: string,
    metric: MetricCode,
    what: string,
  ): Promise<SubscriptionWithPlan> {
    const rootId = await this.entitlements.rootId(businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);
    const flags = this.entitlements.statusFlags(sub);
    if (sub.status === 'trialing') {
      await this.remedies.throwLimit(
        USAGE_ERROR_CODES.TRIAL_METERED_DISABLED,
        `${what} isn't available during the free trial. Choose a plan to turn it on. Nothing was sent or charged.`,
        metric,
        this.ctx(sub, metric),
        {
          remedies: [
            { type: 'upgrade', label: 'Choose a plan', target: 'growth' },
          ],
        },
      );
    }
    if (flags.meteredPaused) {
      await this.remedies.throwLimit(
        sub.status === 'past_due'
          ? USAGE_ERROR_CODES.SUBSCRIPTION_PAST_DUE
          : USAGE_ERROR_CODES.SUBSCRIPTION_PAUSED,
        `${what} is paused because your subscription payment is overdue. Nothing was sent or charged.`,
        metric,
        this.ctx(sub, metric),
        {
          remedies: [
            { type: 'add_payment_method', label: 'Update payment method' },
          ],
        },
      );
    }
    return sub;
  }

  private async spendAllowance(
    rootId: string,
    group: CapGroup,
    sub: SubscriptionWithPlan,
  ): Promise<string> {
    const win = usageWindow(sub, new Date());
    const row = await this.prisma.allowance.upsert({
      where: {
        businessId_metricCode_periodStart: {
          businessId: rootId,
          metricCode: `spend:${group}`,
          periodStart: win.start,
        },
      },
      create: {
        businessId: rootId,
        metricCode: `spend:${group}`,
        periodStart: win.start,
        periodEnd: win.end,
      },
      update: {},
    });
    return row.id;
  }

  /**
   * SC-01: set money aside against the cap before the provider is called. Idempotent per key.
   * Throws SPEND_CAP_REACHED (402) — there is no override flag for anyone (SC-04).
   */
  async holdSpend(input: {
    businessId: string;
    group: CapGroup;
    metricCode: MetricCode;
    amountUsd: number;
    idempotencyKey: string;
    ttlMs: number;
    what: string;
  }): Promise<{ holdId: string; replayed: boolean }> {
    const rootId = await this.entitlements.rootId(input.businessId);
    const existing = await this.prisma.spendHold.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId: rootId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return { holdId: existing.id, replayed: true };
    const sub = await this.entitlements.ensureSubscription(rootId);
    const allowanceId = await this.spendAllowance(rootId, input.group, sub);
    const amount = Math.max(0, Number(input.amountUsd.toFixed(6)));
    let holdId: string | null = null;
    try {
      holdId = await this.prisma.$transaction(async (tx) => {
        const affected = await tx.$executeRaw`
          UPDATE allowances
             SET reserved_usd = reserved_usd + ${amount}
           WHERE id = ${allowanceId}
             AND spent_usd + reserved_usd + ${amount} <= (
               SELECT cap_usd FROM usage_spend_caps
                WHERE business_id = ${rootId} AND cap_group = ${input.group})`;
        if (Number(affected) !== 1) return null;
        const hold = await tx.spendHold.create({
          data: {
            businessId: rootId,
            capGroup: input.group,
            metricCode: input.metricCode,
            allowanceId,
            amountUsd: amount,
            idempotencyKey: input.idempotencyKey,
            state: 'reserved',
            expiresAt: new Date(Date.now() + input.ttlMs),
          },
        });
        return hold.id;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.spendHold.findUniqueOrThrow({
          where: {
            businessId_idempotencyKey: {
              businessId: rootId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        return { holdId: winner.id, replayed: true };
      }
      throw error;
    }
    if (holdId) {
      await this.entitlements.invalidate(rootId);
      return { holdId, replayed: false };
    }
    const caps = await this.entitlements.spendCaps(
      rootId,
      usageWindow(sub, new Date()),
    );
    const cap = caps[input.group];
    return this.remedies.throwLimit(
      USAGE_ERROR_CODES.SPEND_CAP_REACHED,
      `${input.what} needs $${amount.toFixed(2)} and only $${cap.remainingUsd.toFixed(2)} of your $${cap.capUsd.toFixed(2)} monthly ${input.group} limit is left. Nothing was charged. It resets ${formatDateUtc(usageWindow(sub, new Date()).end)}.`,
      input.metricCode,
      this.ctx(sub, input.metricCode),
      {
        remaining: cap.remainingUsd,
        resetsAt: usageWindow(sub, new Date()).end.toISOString(),
        remedies: [
          {
            type: 'raise_cap',
            label: `Raise your monthly ${input.group} limit`,
            target: input.group,
          },
        ],
      },
    );
  }

  /** Settle a hold at its real cost and write the billing event in the same transaction. */
  async settleHold(
    holdId: string,
    actualUsd: number,
    event: Omit<RecordInput, 'businessId' | 'priceUsd'>,
  ): Promise<void> {
    const rootId = await this.prisma.$transaction(async (tx) => {
      const [hold] = await tx.$queryRaw<
        {
          id: string;
          business_id: string;
          allowance_id: string;
          amount_usd: string;
          state: string;
        }[]
      >`
        SELECT id, business_id, allowance_id, amount_usd, state FROM spend_holds WHERE id = ${holdId} FOR UPDATE`;
      if (!hold || hold.state !== 'reserved') return null;
      const amount = Number(hold.amount_usd);
      const actual = Math.max(0, Number(actualUsd.toFixed(6)));
      await tx.$executeRaw`
        UPDATE allowances
           SET reserved_usd = GREATEST(reserved_usd - ${amount}, 0),
               spent_usd = spent_usd + ${actual}
         WHERE id = ${hold.allowance_id}`;
      await tx.spendHold.update({
        where: { id: holdId },
        data: { state: 'committed', actualUsd: actual, settledAt: new Date() },
      });
      await this.record(
        { ...event, businessId: hold.business_id, priceUsd: actual },
        tx,
      );
      return hold.business_id;
    });
    if (rootId) await this.entitlements.invalidate(rootId);
  }

  async releaseHold(
    holdId: string,
    reason: string,
    state: 'released' | 'expired' = 'released',
  ): Promise<void> {
    const rootId = await this.prisma.$transaction(async (tx) => {
      const [hold] = await tx.$queryRaw<
        {
          business_id: string;
          allowance_id: string;
          amount_usd: string;
          state: string;
        }[]
      >`
        SELECT business_id, allowance_id, amount_usd, state FROM spend_holds WHERE id = ${holdId} FOR UPDATE`;
      if (!hold || hold.state !== 'reserved') return null;
      await tx.$executeRaw`
        UPDATE allowances SET reserved_usd = GREATEST(reserved_usd - ${Number(hold.amount_usd)}, 0)
         WHERE id = ${hold.allowance_id}`;
      await tx.spendHold.update({
        where: { id: holdId },
        data: { state, reason: reason.slice(0, 190), settledAt: new Date() },
      });
      return hold.business_id;
    });
    if (rootId) await this.entitlements.invalidate(rootId);
  }

  /**
   * Charges an operation that has already happened (e.g. the human-handled part of a call) against
   * the period's spend. Never refused: in-flight work completes (spec §5.5, SC-02).
   */
  async chargeDirect(
    group: CapGroup,
    amountUsd: number,
    event: Omit<RecordInput, 'priceUsd'>,
  ): Promise<void> {
    const rootId = await this.entitlements.rootId(event.businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);
    const allowanceId = await this.spendAllowance(rootId, group, sub);
    const amount = Math.max(0, Number(amountUsd.toFixed(6)));
    await this.prisma.$transaction(async (tx) => {
      const fresh = await this.record({ ...event, priceUsd: amount }, tx);
      if (fresh) {
        await tx.$executeRaw`UPDATE allowances SET spent_usd = spent_usd + ${amount} WHERE id = ${allowanceId}`;
      }
    });
    await this.entitlements.invalidate(rootId);
  }

  /**
   * AI Receptionist admission (spec §5.4, SC-03): the plan must include it, the account must not
   * be on trial or paused, and the voice limit must cover the LONGEST allowed call at the current
   * rate — that amount is set aside so a call is never cut off mid-sentence. Returns the reason
   * instead of throwing so the caller can route the call to the team.
   */
  async admitAiCall(
    businessId: string,
    callSid: string,
  ): Promise<
    { admitted: true; holdId: string } | { admitted: false; reason: string }
  > {
    const rootId = await this.entitlements.rootId(businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);
    const feature = this.entitlements.includedFor(sub, 'ai_phone_receptionist');
    if (!feature)
      return {
        admitted: false,
        reason:
          feature == null
            ? 'usage:receptionist_not_confirmed_for_plan'
            : 'usage:receptionist_not_in_plan',
      };
    if (sub.status === 'trialing')
      return { admitted: false, reason: 'usage:trial' };
    if (this.entitlements.statusFlags(sub).meteredPaused)
      return { admitted: false, reason: 'usage:subscription_not_active' };
    const rate = await this.unitPrice('ai_voice_minutes');
    if (rate == null)
      return { admitted: false, reason: 'usage:no_published_rate' };
    const cap = await this.prisma.usageSpendCap.findUnique({
      where: { businessId_capGroup: { businessId: rootId, capGroup: 'voice' } },
    });
    const maxMinutes = cap?.maxCallMinutes ?? 10;
    try {
      const { holdId } = await this.holdSpend({
        businessId: rootId,
        group: 'voice',
        metricCode: 'ai_voice_minutes',
        amountUsd: maxMinutes * rate,
        idempotencyKey: `call:${callSid}`,
        ttlMs: (maxMinutes + 60) * 60_000,
        what: `A ${maxMinutes}-minute AI call`,
      });
      return { admitted: true, holdId };
    } catch (error) {
      if (error instanceof Error && 'details' in error)
        return { admitted: false, reason: 'usage:voice_limit_reached' };
      throw error;
    }
  }

  /** Splits a finished call into its AI and human parts, each charged once on its own meter. */
  async settleCall(call: {
    businessId: string;
    callSid: string;
    direction: string;
    fromNumber: string;
    startedAt: Date;
    joinedAt: Date | null;
    endedAt: Date | null;
    voiceAgentVersionId: string | null;
  }): Promise<void> {
    const end = call.endedAt ?? new Date();
    const minutes = (from: Date, to: Date) =>
      Math.max(
        0,
        Math.round(((to.getTime() - from.getTime()) / 60_000) * 100) / 100,
      );
    const hold = await this.findHold(call.businessId, `call:${call.callSid}`);
    const aiMinutes = call.voiceAgentVersionId
      ? minutes(call.startedAt, call.joinedAt ?? end)
      : 0;
    if (hold && hold.state === 'reserved') {
      if (aiMinutes > 0) {
        const rate = (await this.unitPrice('ai_voice_minutes')) ?? 0;
        await this.settleHold(hold.id, aiMinutes * rate, {
          metricCode: 'ai_voice_minutes',
          quantity: aiMinutes,
          unit: 'minute',
          idempotencyKey: `call:ai:${call.callSid}`,
          operationCode: 'receptionist.call',
          provider: 'twilio',
          providerRef: call.callSid,
          countryCode: countryOf(call.fromNumber),
          metadata: { direction: call.direction },
        });
      } else {
        await this.releaseHold(hold.id, 'call not handled by AI');
      }
    }
    const humanFrom =
      call.joinedAt ??
      (call.direction === 'outbound' && !call.voiceAgentVersionId
        ? call.startedAt
        : null);
    if (humanFrom) {
      const humanMinutes = minutes(humanFrom, end);
      const country =
        call.direction === 'outbound'
          ? (countryOf(call.fromNumber) ?? 'US')
          : 'US';
      const rate = await this.unitPrice('voice_minutes', country);
      if (humanMinutes > 0) {
        await this.chargeDirect(
          'voice',
          rate == null ? 0 : humanMinutes * rate,
          {
            businessId: call.businessId,
            metricCode: 'voice_minutes',
            quantity: humanMinutes,
            unit: 'minute',
            idempotencyKey: `call:human:${call.callSid}`,
            operationCode: 'voice.human_call',
            provider: 'twilio',
            providerRef: call.callSid,
            countryCode: country,
            status: rate == null ? 'refused' : 'completed',
            metadata: {
              direction: call.direction,
              rate: rate == null ? 'no approved rate' : rate,
            },
          },
        );
      }
    }
  }

  /**
   * The customer's own monthly limit (spec §5.5): raising or lowering it is a logged customer
   * action. A limit below what's already spent this period is refused (it couldn't be honoured).
   */
  async updateSpendCap(
    businessId: string,
    actorUserId: string,
    group: CapGroup,
    input: { capUsd: number; maxCallMinutes?: number },
  ) {
    const rootId = await this.entitlements.rootId(businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);
    const caps = await this.entitlements.spendCaps(
      rootId,
      usageWindow(sub, new Date()),
    );
    const current = caps[group];
    const capUsd = Math.round(input.capUsd * 100) / 100;
    if (!(capUsd >= 1) || capUsd > 100_000) {
      throw new AppException(
        'SPEND_CAP_INVALID',
        'Enter a monthly limit between $1 and $100,000.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (capUsd < current.spentUsd + current.reservedUsd) {
      throw new AppException(
        'SPEND_CAP_INVALID',
        `You've already used $${(current.spentUsd + current.reservedUsd).toFixed(2)} this period, so the limit can't be lower than that.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const maxCallMinutes =
      group === 'voice'
        ? Math.round(input.maxCallMinutes ?? current.maxCallMinutes ?? 10)
        : null;
    if (group === 'voice' && !(maxCallMinutes! >= 1 && maxCallMinutes! <= 60)) {
      throw new AppException(
        'SPEND_CAP_INVALID',
        'Maximum call length must be 1 to 60 minutes.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.usageSpendCap.upsert({
        where: { businessId_capGroup: { businessId: rootId, capGroup: group } },
        create: {
          businessId: rootId,
          capGroup: group,
          capUsd,
          maxCallMinutes,
          updatedById: actorUserId,
        },
        update: { capUsd, maxCallMinutes, updatedById: actorUserId },
      });
      await tx.entitlementAudit.create({
        data: {
          businessId: rootId,
          actorUserId,
          actorType: 'user',
          changeType: 'spend_cap',
          before: {
            capUsd: current.capUsd,
            maxCallMinutes: current.maxCallMinutes,
          },
          after: { capUsd, maxCallMinutes },
          reason: `${group === 'voice' ? 'Voice' : 'Messaging'} spending limit changed`,
        },
      });
      await tx.usageOutbox.create({
        data: {
          businessId: rootId,
          type: 'spend_cap.updated',
          payload: { metric: group, from_usd: current.capUsd, to_usd: capUsd },
        },
      });
    });
    await this.entitlements.bumpVersion(rootId);
    return this.entitlements.spendCaps(rootId, usageWindow(sub, new Date()));
  }

  async findHold(businessId: string, idempotencyKey: string) {
    const rootId = await this.entitlements.rootId(businessId);
    return this.prisma.spendHold.findUnique({
      where: {
        businessId_idempotencyKey: { businessId: rootId, idempotencyKey },
      },
    });
  }

  async sweepExpiredHolds(now = new Date()): Promise<number> {
    const stale = await this.prisma.spendHold.findMany({
      where: { state: 'reserved', expiresAt: { lt: now } },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: 500,
    });
    for (const h of stale)
      await this.releaseHold(h.id, 'expired: never settled', 'expired');
    if (stale.length)
      this.logger.log(`Released ${stale.length} expired spend hold(s)`);
    return stale.length;
  }
}
