import { HttpStatus, Injectable, Logger } from '@nestjs/common';
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
