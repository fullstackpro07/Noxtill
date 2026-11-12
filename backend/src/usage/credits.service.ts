import { Injectable, Logger } from '@nestjs/common';
import { CreditBalance, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EntitlementsService,
  SubscriptionWithPlan,
} from './entitlements.service';
import { RemediesService } from './remedies.service';
import {
  BAND_CREDITS,
  INTELLIGENCE_OPERATION_CODES,
  METRICS,
  CreditBand,
  ESTIMATE_EXCEEDED_RATIO,
  RESERVATION_TTL_MS,
  USAGE_ERROR_CODES,
} from './usage.constants';
import { usageWindow } from './usage-period.util';
import { AppException } from '../common/filters/app.exception';
import { HttpStatus } from '@nestjs/common';

export interface ReserveInput {
  businessId: string;
  operationCode: string;
  band: CreditBand;
  /** Defaults to the band's nominal credits (spec §4.8: reserve nominal, commit actual). */
  quantity?: number;
  idempotencyKey: string;
  actorUserId?: string | null;
}

export interface Reservation {
  reservationId: string;
  businessId: string;
  reservedQty: number;
  expiresAt: Date;
  state: string;
  replayed: boolean;
}

interface LockedLedger {
  id: string;
  business_id: string;
  reserved_qty: number;
  state: string;
  operation_code: string;
  band: string;
}

interface LockedBalance {
  included_quantity: number;
  included_used: number;
  purchased_balance: number;
  reserved: number;
}

/**
 * AI credits: reserve → commit → release (spec §4.7). The availability check and the
 * `reserved +=` are ONE conditional UPDATE on `credit_balances`, so two concurrent requests can
 * never both pass a check only one should pass (CR-03), and the balance can never go below zero.
 * Every reservation is keyed by an idempotency key, so a retried request is charged once (CR-06).
 */
@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly remedies: RemediesService,
  ) {}

  /**
   * Makes sure the balance row exists and belongs to the current usage window; rolls it when a
   * new window has started (included resets, purchased survives — CR-10). The roll is a
   * conditional update on the old period start, so concurrent callers roll it exactly once.
   */
  async ensureBalance(
    rootId: string,
    sub?: SubscriptionWithPlan,
    now = new Date(),
  ): Promise<CreditBalance> {
    const subscription =
      sub ?? (await this.entitlements.ensureSubscription(rootId));
    const win = usageWindow(subscription, now);
    const included =
      this.entitlements.includedFor(subscription, 'ai_credits') ?? 0;
    const existing = await this.prisma.creditBalance.findUnique({
      where: { businessId: rootId },
    });
    if (!existing) {
      try {
        await this.prisma.$transaction([
          this.prisma.creditBalance.create({
            data: {
              businessId: rootId,
              periodStart: win.start,
              periodEnd: win.end,
              includedQuantity: included,
            },
          }),
          this.allocationEvent(rootId, win.start, included),
        ]);
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
      }
      return this.prisma.creditBalance.findUniqueOrThrow({
        where: { businessId: rootId },
      });
    }
    if (existing.periodStart.getTime() === win.start.getTime()) return existing;

    // New window: snapshot the old one, reset the included bucket.
    await this.prisma.$transaction(async (tx) => {
      const rolled = await tx.creditBalance.updateMany({
        where: { businessId: rootId, periodStart: existing.periodStart },
        data: {
          periodStart: win.start,
          periodEnd: win.end,
          includedQuantity: included,
          includedUsed: 0,
          purchasedUsed: 0,
        },
      });
      if (rolled.count !== 1) return;
      await tx.allowance.upsert({
        where: {
          businessId_metricCode_periodStart: {
            businessId: rootId,
            metricCode: 'ai_credits',
            periodStart: existing.periodStart,
          },
        },
        create: {
          businessId: rootId,
          metricCode: 'ai_credits',
          periodStart: existing.periodStart,
          periodEnd: existing.periodEnd,
          includedQuantity: existing.includedQuantity,
          purchasedQuantity: existing.purchasedBalance + existing.purchasedUsed,
          usedQuantity: existing.includedUsed + existing.purchasedUsed,
        },
        update: {},
      });
      await this.allocationEvent(rootId, win.start, included, tx);
      await tx.usageOutbox.create({
        data: {
          businessId: rootId,
          type: 'subscription.period_rolled',
          payload: {
            period_start: win.start.toISOString(),
            period_end: win.end.toISOString(),
          },
        },
      });
    });
    await this.entitlements.invalidate(rootId);
    return this.prisma.creditBalance.findUniqueOrThrow({
      where: { businessId: rootId },
    });
  }

  private allocationEvent(
    rootId: string,
    periodStart: Date,
    included: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.usageEvent.upsert({
      where: {
        businessId_idempotencyKey: {
          businessId: rootId,
          idempotencyKey: `alloc:ai_credits:${periodStart.toISOString()}`,
        },
      },
      create: {
        businessId: rootId,
        metricCode: 'ai_credits',
        operationCode: 'allowance.allocated',
        quantity: included,
        unit: 'credit',
        status: 'allocated',
        idempotencyKey: `alloc:ai_credits:${periodStart.toISOString()}`,
        occurredAt: periodStart,
      },
      update: {},
    });
  }

  async reserve(input: ReserveInput): Promise<Reservation> {
    const rootId = await this.entitlements.rootId(input.businessId);
    let quantity = Math.max(
      1,
      Math.ceil(input.quantity ?? BAND_CREDITS[input.band]),
    );

    const replay = await this.prisma.creditLedger.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId: rootId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (replay) return this.toReservation(replay, true);

    const sub = await this.entitlements.ensureSubscription(rootId);
    const flags = this.entitlements.statusFlags(sub);
    const ctx = {
      planKey: sub.plan.key,
      included: this.entitlements.includedFor(sub, 'ai_credits'),
      trialing: sub.status === 'trialing',
    };
    if (flags.meteredPaused) {
      await this.remedies.throwLimit(
        sub.status === 'past_due'
          ? USAGE_ERROR_CODES.SUBSCRIPTION_PAST_DUE
          : USAGE_ERROR_CODES.SUBSCRIPTION_PAUSED,
        sub.status === 'past_due'
          ? 'AI features are paused because your subscription payment is overdue. Update your payment method to continue.'
          : 'AI features are paused because your subscription is not active.',
        'ai_credits',
        ctx,
        {
          remedies: [
            { type: 'add_payment_method', label: 'Update payment method' },
          ],
        },
      );
    }
    if (ctx.included == null) {
      await this.remedies.throwLimit(
        USAGE_ERROR_CODES.METRIC_NOT_CONFIGURED,
        'Your AI credit allowance is not confirmed yet. AI features are paused and nothing is charged.',
        'ai_credits',
        ctx,
        {
          remedies: [
            { type: 'contact', label: 'Contact your Noxtill account manager' },
          ],
        },
      );
    }
    // Heavy intelligence features use their own monthly run allowance, not AI credits.
    const runMetered =
      INTELLIGENCE_OPERATION_CODES.has(input.operationCode) &&
      this.entitlements.includedFor(sub, METRICS.INTELLIGENCE_RUNS) != null;
    if (runMetered) {
      const set = await this.entitlements.resolve(rootId, { fresh: true });
      const runs = set.metrics[METRICS.INTELLIGENCE_RUNS];
      const limit = runs ? (runs.included ?? 0) + runs.purchased : 0;
      if (!runs || runs.used + 1 > limit) {
        await this.remedies.throwLimit(
          USAGE_ERROR_CODES.ALLOWANCE_EXHAUSTED,
          `You have used all ${limit.toLocaleString('en-US')} Intelligence runs for this period.`,
          METRICS.INTELLIGENCE_RUNS,
          ctx,
          {
            remaining: Math.max(0, limit - (runs?.used ?? 0)),
            resetsAt: runs?.resetsAt ?? undefined,
          },
        );
      }
      quantity = 0;
    }
    const balance = await this.ensureBalance(rootId, sub);
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

    let created: Reservation | null = null;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const affected = await tx.$executeRaw`
          UPDATE credit_balances
             SET reserved = reserved + ${quantity}
           WHERE business_id = ${rootId}
             AND (included_quantity - included_used) + purchased_balance - reserved >= ${quantity}`;
        if (Number(affected) !== 1) return null;
        const row = await tx.creditLedger.create({
          data: {
            businessId: rootId,
            idempotencyKey: input.idempotencyKey,
            operationCode: input.operationCode,
            band: runMetered ? 'run' : input.band,
            reservedQty: quantity,
            state: 'reserved',
            actorUserId: input.actorUserId ?? null,
            expiresAt,
          },
        });
        await tx.usageOutbox.create({
          data: {
            businessId: rootId,
            type: 'usage.reserved',
            payload: { metric: 'ai_credits', quantity, reservation_id: row.id },
          },
        });
        return this.toReservation(row, false);
      });
    } catch (error) {
      // Same key raced in from a concurrent retry: the transaction rolled back our `reserved +=`.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.creditLedger.findUniqueOrThrow({
          where: {
            businessId_idempotencyKey: {
              businessId: rootId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        return this.toReservation(winner, true);
      }
      throw error;
    }
    if (created) {
      await this.entitlements.invalidate(rootId);
      return created;
    }

    const fresh = await this.prisma.creditBalance.findUniqueOrThrow({
      where: { businessId: rootId },
    });
    const remaining = Math.max(
      0,
      fresh.includedQuantity -
        fresh.includedUsed +
        fresh.purchasedBalance -
        fresh.reserved,
    );
    return this.remedies.throwLimit(
      USAGE_ERROR_CODES.ALLOWANCE_EXHAUSTED,
      remaining === 0
        ? `You have used all ${(fresh.includedQuantity + fresh.purchasedBalance + fresh.purchasedUsed).toLocaleString('en-US')} AI credits for this period.`
        : `This needs ${quantity.toLocaleString('en-US')} AI credits and you have ${remaining.toLocaleString('en-US')} left.`,
      'ai_credits',
      ctx,
      { remaining, resetsAt: balance.periodEnd.toISOString() },
    );
  }

  async commit(
    reservationId: string,
    actualQuantity?: number,
  ): Promise<{ charged: number }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const [ledger] = await tx.$queryRaw<LockedLedger[]>`
        SELECT id, business_id, reserved_qty, state, operation_code, band
          FROM credit_ledger WHERE id = ${reservationId} FOR UPDATE`;
      if (!ledger) {
        throw new AppException(
          USAGE_ERROR_CODES.RESERVATION_NOT_FOUND,
          'Reservation not found',
          HttpStatus.NOT_FOUND,
        );
      }
      if (ledger.state !== 'reserved')
        return { charged: 0, rootId: ledger.business_id, settled: false };
      if (ledger.band === 'run') {
        // Settled as one Intelligence run; no credits move.
        await tx.creditLedger.update({
          where: { id: reservationId },
          data: { state: 'committed', actualQty: 0, settledAt: new Date() },
        });
        await tx.usageEvent.create({
          data: {
            businessId: ledger.business_id,
            metricCode: METRICS.INTELLIGENCE_RUNS,
            operationCode: ledger.operation_code,
            quantity: 1,
            unit: 'run',
            idempotencyKey: `run:${reservationId}`,
            occurredAt: new Date(),
          },
        });
        return { charged: 0, rootId: ledger.business_id, settled: true };
      }
      const reservedQty = Number(ledger.reserved_qty);
      const actual = Math.max(0, Math.ceil(actualQuantity ?? reservedQty));
      const [bal] = await tx.$queryRaw<LockedBalance[]>`
        SELECT included_quantity, included_used, purchased_balance, reserved
          FROM credit_balances WHERE business_id = ${ledger.business_id} FOR UPDATE`;
      const includedRemaining = Math.max(
        0,
        Number(bal.included_quantity) - Number(bal.included_used),
      );
      const purchased = Number(bal.purchased_balance);
      const othersReserved = Math.max(0, Number(bal.reserved) - reservedQty);
      // `available` still contains this reservation's own held credits. Never charge more than is
      // actually there, so the balance can never go negative (CR-11); a shortfall is reported via
      // `usage.estimate_exceeded`, not by failing an operation the customer already received.
      const available = Math.max(
        0,
        includedRemaining + purchased - othersReserved,
      );
      const finalCharge = Math.min(actual, available);
      const includedPart = Math.min(finalCharge, includedRemaining);
      const purchasedPart = finalCharge - includedPart;

      await tx.$executeRaw`
        UPDATE credit_balances
           SET reserved = GREATEST(reserved - ${reservedQty}, 0),
               included_used = included_used + ${includedPart},
               purchased_balance = purchased_balance - ${purchasedPart},
               purchased_used = purchased_used + ${purchasedPart}
         WHERE business_id = ${ledger.business_id}`;
      await tx.creditLedger.update({
        where: { id: reservationId },
        data: {
          state: 'committed',
          actualQty: finalCharge,
          includedPart,
          purchasedPart,
          bucket:
            purchasedPart === 0
              ? 'included'
              : includedPart === 0
                ? 'purchased'
                : 'split',
          settledAt: new Date(),
        },
      });
      await tx.usageEvent.create({
        data: {
          businessId: ledger.business_id,
          metricCode: 'ai_credits',
          operationCode: ledger.operation_code,
          quantity: finalCharge,
          unit: 'credit',
          idempotencyKey: `credit:${reservationId}`,
          occurredAt: new Date(),
          metadata: {
            reserved: reservedQty,
            actual,
            includedPart,
            purchasedPart,
          },
        },
      });
      await tx.usageOutbox.create({
        data: {
          businessId: ledger.business_id,
          type: 'usage.committed',
          payload: {
            metric: 'ai_credits',
            actual: finalCharge,
            operation_code: ledger.operation_code,
          },
        },
      });
      if (
        actual > reservedQty * ESTIMATE_EXCEEDED_RATIO ||
        finalCharge < actual
      ) {
        await tx.usageOutbox.create({
          data: {
            businessId: ledger.business_id,
            type: 'usage.estimate_exceeded',
            payload: {
              operation_code: ledger.operation_code,
              reserved: reservedQty,
              actual,
              charged: finalCharge,
            },
          },
        });
      }
      return {
        charged: finalCharge,
        rootId: ledger.business_id,
        settled: true,
      };
    });
    if (result.settled) await this.entitlements.invalidate(result.rootId);
    return { charged: result.charged };
  }

  async release(
    reservationId: string,
    reason: string,
    state: 'released' | 'expired' = 'released',
  ): Promise<void> {
    const rootId = await this.prisma.$transaction(async (tx) => {
      const [ledger] = await tx.$queryRaw<LockedLedger[]>`
        SELECT id, business_id, reserved_qty, state, operation_code, band
          FROM credit_ledger WHERE id = ${reservationId} FOR UPDATE`;
      if (!ledger || ledger.state !== 'reserved') return null;
      await tx.creditLedger.update({
        where: { id: reservationId },
        data: { state, reason: reason.slice(0, 190), settledAt: new Date() },
      });
      await tx.$executeRaw`
        UPDATE credit_balances SET reserved = GREATEST(reserved - ${Number(ledger.reserved_qty)}, 0)
         WHERE business_id = ${ledger.business_id}`;
      await tx.usageOutbox.create({
        data: {
          businessId: ledger.business_id,
          type: 'usage.released',
          payload: {
            metric: 'ai_credits',
            reason,
            reservation_id: reservationId,
          },
        },
      });
      return ledger.business_id;
    });
    if (rootId) await this.entitlements.invalidate(rootId);
  }

  /** CR-07: reservations nobody settled within 15 minutes are released, never charged. */
  async sweepExpired(now = new Date()): Promise<number> {
    const stale = await this.prisma.creditLedger.findMany({
      where: { state: 'reserved', expiresAt: { lt: now } },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: 500,
    });
    for (const row of stale) {
      await this.release(
        row.id,
        'expired: not settled within 15 minutes',
        'expired',
      );
    }
    if (stale.length)
      this.logger.log(`Released ${stale.length} expired credit reservation(s)`);
    return stale.length;
  }

  /** A paid top-up lands in the purchased bucket, which never expires (spec §4.6). Idempotent per purchase. */
  async grantPurchased(
    rootId: string,
    quantity: number,
    purchaseId: string,
  ): Promise<boolean> {
    await this.ensureBalance(rootId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.usageEvent.create({
          data: {
            businessId: rootId,
            metricCode: 'ai_credits',
            operationCode: 'purchase.credits',
            quantity,
            unit: 'credit',
            status: 'allocated',
            idempotencyKey: `purchase:${purchaseId}`,
            occurredAt: new Date(),
          },
        });
        await tx.$executeRaw`
          UPDATE credit_balances SET purchased_balance = purchased_balance + ${quantity}
           WHERE business_id = ${rootId}`;
        await tx.usageOutbox.create({
          data: {
            businessId: rootId,
            type: 'capacity.purchased',
            payload: { metric: 'ai_credits', quantity },
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return false;
      throw error;
    }
    await this.entitlements.invalidate(rootId);
    return true;
  }

  private toReservation(
    row: {
      id: string;
      businessId: string;
      reservedQty: number;
      expiresAt: Date;
      state: string;
    },
    replayed: boolean,
  ): Reservation {
    return {
      reservationId: row.id,
      businessId: row.businessId,
      reservedQty: row.reservedQty,
      expiresAt: row.expiresAt,
      state: row.state,
      replayed,
    };
  }
}
