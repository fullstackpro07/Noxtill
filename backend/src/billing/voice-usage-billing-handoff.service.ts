import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { StripeGatewayAdapter } from './adapters/stripe-gateway.adapter';

const fail = (code: string, message: string, status = HttpStatus.CONFLICT) =>
  new AppException(code, message, status);

/**
 * Hands an owner-approved voice usage draft to Stripe as ONE pending invoice item on the
 * business's Stripe customer, so it appears on their next invoice. The Stripe idempotency key is
 * the draft id, so a retry (or a crash between Stripe and our write) can never add it twice.
 * Nothing is charged directly here; Stripe's normal invoicing collects it.
 */
@Injectable()
export class VoiceUsageBillingHandoffService {
  private readonly logger = new Logger(VoiceUsageBillingHandoffService.name);

  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly stripe: StripeGatewayAdapter,
  ) {}

  async post(businessId: string, actorUserId: string, draftId: string) {
    const db = this.tenant.client;
    const owner = await db.businessUser.findFirst({
      where: { businessId, userId: actorUserId, role: 'owner', active: true },
      select: { id: true },
    });
    if (!owner) {
      throw fail(
        'VOICE_BILLING_OWNER_REQUIRED',
        'Only an active business owner can send usage to billing.',
        HttpStatus.FORBIDDEN,
      );
    }
    const draft = await db.voiceBillingDraft.findFirst({
      where: { id: draftId, businessId },
    });
    if (!draft) {
      throw fail(
        'VOICE_BILLING_DRAFT_NOT_FOUND',
        'The usage draft was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (draft.status === 'posted') return this.present(draft);
    if (draft.status !== 'approved' && draft.status !== 'posting') {
      throw fail(
        'VOICE_BILLING_DRAFT_NOT_APPROVED',
        'Only an approved usage draft can be sent to billing.',
      );
    }
    const business = await db.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { stripeCustomerId: true },
    });
    const client = this.stripe.stripe;
    if (!client) {
      throw fail(
        'VOICE_BILLING_STRIPE_NOT_CONFIGURED',
        'Stripe is not configured on this server, so nothing was sent.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!business.stripeCustomerId) {
      throw fail(
        'VOICE_BILLING_NO_CUSTOMER',
        'This business has no Stripe billing customer yet (start a subscription first). Nothing was sent.',
      );
    }
    const minor = Math.round(
      Number(draft.total) * 10 ** draft.currencyMinorUnits,
    );
    if (!Number.isSafeInteger(minor) || minor <= 0) {
      throw fail(
        'VOICE_BILLING_EMPTY_DRAFT',
        'This draft has no billable amount to send.',
      );
    }

    // Claim the draft so two clicks cannot race; a stuck "posting" draft can be retried safely.
    const claimed = await db.voiceBillingDraft.updateMany({
      where: {
        id: draftId,
        businessId,
        status: { in: ['approved', 'posting'] },
      },
      data: { status: 'posting', postError: null },
    });
    if (claimed.count !== 1)
      throw fail(
        'VOICE_BILLING_DRAFT_LOCKED',
        'This draft changed; reload and retry.',
      );

    let itemId: string;
    try {
      const item = await client.invoiceItems.create(
        {
          customer: business.stripeCustomerId,
          amount: minor,
          currency: draft.currency.toLowerCase(),
          description: `Phone usage ${draft.periodStart.toISOString().slice(0, 10)} to ${draft.periodEnd.toISOString().slice(0, 10)} (${draft.itemCount} items)`,
          metadata: {
            voiceBillingDraftId: draft.id,
            businessId,
            evidenceHash: draft.evidenceHash,
          },
        },
        { idempotencyKey: `voice-usage-draft-${draft.id}` },
      );
      itemId = item.id;
    } catch (error) {
      const message =
        (error as Error).message?.slice(0, 280) ||
        'Stripe rejected the request';
      await db.voiceBillingDraft.updateMany({
        where: { id: draftId, status: 'posting' },
        data: { status: 'approved', postError: message },
      });
      this.logger.warn(
        `Voice usage draft ${draftId} was not sent to Stripe: ${message}`,
      );
      throw fail(
        'VOICE_BILLING_STRIPE_REJECTED',
        `Stripe did not accept the usage: ${message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const updated = await db.voiceBillingDraft.update({
      where: { id: draftId },
      data: {
        status: 'posted',
        postedAt: new Date(),
        postedByUserId: actorUserId,
        providerInvoiceItemId: itemId,
        postError: null,
      },
    });
    await db.auditLog.create({
      data: {
        businessId,
        actorUserId,
        entity: 'VoiceBillingDraft',
        entityId: draftId,
        action: 'voice.billing.draft_posted',
        after: {
          providerInvoiceItemId: itemId,
          amountMinor: minor,
          currency: draft.currency,
        },
      },
    });
    return this.present(updated);
  }

  /** Credits issued against a draft (newest first). */
  async adjustments(businessId: string, draftId: string) {
    const rows = await this.tenant.client.voiceBillingAdjustment.findMany({
      where: { businessId, draftId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({ ...row, amount: row.amount.toString() }));
  }

  /**
   * Issues a credit against a draft already sent to Stripe. The remaining creditable amount is
   * checked under a row lock on the draft, so concurrent credits cannot exceed the billed total.
   * The credit is then posted once as a negative invoice item (idempotency key = adjustment id).
   */
  async credit(
    businessId: string,
    actorUserId: string,
    draftId: string,
    amountText: string,
    reasonText: string,
  ) {
    const db = this.tenant.client;
    await this.requireOwner(businessId, actorUserId);
    const reason = reasonText?.trim() ?? '';
    if (reason.length < 8 || reason.length > 500) {
      throw fail(
        'VOICE_BILLING_REASON_REQUIRED',
        'Enter a credit reason between 8 and 500 characters.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      !/^\d{1,12}(\.\d{1,6})?$/.test(amountText ?? '') ||
      Number(amountText) <= 0
    ) {
      throw fail(
        'VOICE_BILLING_CREDIT_INVALID',
        'Enter a positive credit amount.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const adjustment = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM voice_billing_drafts WHERE id = ${draftId} AND business_id = ${businessId} FOR UPDATE`;
      const draft = await tx.voiceBillingDraft.findFirst({
        where: { id: draftId, businessId },
      });
      if (!draft)
        throw fail(
          'VOICE_BILLING_DRAFT_NOT_FOUND',
          'The usage draft was not found.',
          HttpStatus.NOT_FOUND,
        );
      if (draft.status !== 'posted') {
        throw fail(
          'VOICE_BILLING_DRAFT_NOT_POSTED',
          'Only usage already sent to billing can be credited. Cancel an unsent draft instead.',
        );
      }
      const amount = new Prisma.Decimal(amountText).toDecimalPlaces(
        draft.currencyMinorUnits,
      );
      const prior = await tx.voiceBillingAdjustment.aggregate({
        // A failed credit keeps its amount reserved so a later retry cannot over-credit.
        where: {
          businessId,
          draftId,
          status: { in: ['pending', 'posted', 'failed'] },
        },
        _sum: { amount: true },
      });
      const remaining = draft.total.minus(prior._sum.amount ?? 0);
      if (amount.lte(0) || amount.gt(remaining)) {
        throw fail(
          'VOICE_BILLING_CREDIT_TOO_LARGE',
          `The credit can be at most ${remaining.toFixed(draft.currencyMinorUnits)} ${draft.currency}.`,
        );
      }
      return tx.voiceBillingAdjustment.create({
        data: {
          businessId,
          draftId,
          amount,
          currency: draft.currency,
          reason,
          createdByUserId: actorUserId,
        },
      });
    });
    return this.postCredit(businessId, actorUserId, adjustment.id);
  }

  /** Posts (or retries) a pending/failed credit to Stripe; a posted credit is returned unchanged. */
  async postCredit(
    businessId: string,
    actorUserId: string,
    adjustmentId: string,
  ) {
    const db = this.tenant.client;
    await this.requireOwner(businessId, actorUserId);
    const adjustment = await db.voiceBillingAdjustment.findFirst({
      where: { id: adjustmentId, businessId },
    });
    if (!adjustment)
      throw fail(
        'VOICE_BILLING_CREDIT_NOT_FOUND',
        'The credit was not found.',
        HttpStatus.NOT_FOUND,
      );
    if (adjustment.status === 'posted')
      return { ...adjustment, amount: adjustment.amount.toString() };
    const [draft, business] = await Promise.all([
      db.voiceBillingDraft.findFirstOrThrow({
        where: { id: adjustment.draftId, businessId },
      }),
      db.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { stripeCustomerId: true },
      }),
    ]);
    const client = this.stripe.stripe;
    if (!client || !business.stripeCustomerId) {
      await db.voiceBillingAdjustment.update({
        where: { id: adjustment.id },
        data: {
          status: 'failed',
          postError: !client
            ? 'Stripe is not configured on this server.'
            : 'No Stripe billing customer for this business.',
        },
      });
      throw fail(
        'VOICE_BILLING_STRIPE_NOT_CONFIGURED',
        'The credit was saved but not sent: Stripe or the billing customer is not set up.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const minor = Math.round(
      Number(adjustment.amount) * 10 ** draft.currencyMinorUnits,
    );
    try {
      const item = await client.invoiceItems.create(
        {
          customer: business.stripeCustomerId,
          amount: -minor,
          currency: adjustment.currency.toLowerCase(),
          description:
            `Credit for phone usage ${draft.periodStart.toISOString().slice(0, 10)} to ${draft.periodEnd.toISOString().slice(0, 10)}: ${adjustment.reason}`.slice(
              0,
              500,
            ),
          metadata: {
            voiceBillingDraftId: draft.id,
            voiceBillingAdjustmentId: adjustment.id,
            businessId,
          },
        },
        { idempotencyKey: `voice-usage-credit-${adjustment.id}` },
      );
      const posted = await db.voiceBillingAdjustment.update({
        where: { id: adjustment.id },
        data: {
          status: 'posted',
          postedAt: new Date(),
          providerInvoiceItemId: item.id,
          postError: null,
        },
      });
      await db.auditLog.create({
        data: {
          businessId,
          actorUserId,
          entity: 'VoiceBillingAdjustment',
          entityId: adjustment.id,
          action: 'voice.billing.credit_posted',
          after: {
            draftId: draft.id,
            amountMinor: minor,
            currency: adjustment.currency,
            reason: adjustment.reason,
            providerInvoiceItemId: item.id,
          },
        },
      });
      return { ...posted, amount: posted.amount.toString() };
    } catch (error) {
      const message =
        (error as Error).message?.slice(0, 280) ||
        'Stripe rejected the request';
      await db.voiceBillingAdjustment.update({
        where: { id: adjustment.id },
        data: { status: 'failed', postError: message },
      });
      throw fail(
        'VOICE_BILLING_STRIPE_REJECTED',
        `Stripe did not accept the credit: ${message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async requireOwner(businessId: string, actorUserId: string) {
    const owner = await this.tenant.client.businessUser.findFirst({
      where: { businessId, userId: actorUserId, role: 'owner', active: true },
      select: { id: true },
    });
    if (!owner) {
      throw fail(
        'VOICE_BILLING_OWNER_REQUIRED',
        'Only an active business owner can change platform billing.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private present(draft: {
    id: string;
    status: string;
    postedAt: Date | null;
    providerInvoiceItemId: string | null;
    total: unknown;
    currency: string;
  }) {
    return {
      id: draft.id,
      status: draft.status,
      postedAt: draft.postedAt?.toISOString() ?? null,
      providerInvoiceItemId: draft.providerInvoiceItemId,
      total: String(draft.total),
      currency: draft.currency,
    };
  }
}
