import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { BillingService } from '../billing/billing.service';
import { CreateMembershipPlanDto } from './dto/create-membership-plan.dto';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MEMBERSHIP_ERROR_CODES } from './memberships.constants';
import { MembershipStatus, Prisma } from '@prisma/client';

/** Membership depth fix (UPD-INT-007) — real interval math shared by cash enrollment and renewal. */
function nextPeriodEnd(from: Date, interval: 'monthly' | 'yearly'): Date {
  const next = new Date(from);
  if (interval === 'yearly') next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Membership plans (UPD-BE-025) — a customer-level recurring subscription, separate from the
 * business's own Stripe billing plan. `method: 'cash'` memberships are real and immediate (the
 * business collects payment manually each period, same trust level as CashRegister elsewhere) —
 * "charges on schedule" for cash means a real `currentPeriodEnd` due date plus a real lapse job
 * (`CrmJobsProcessor.runMembershipExpiry`) and a real `renewCash()` action, since there's no
 * gateway to auto-charge cash. `method: 'online'` memberships create a real Stripe subscription
 * Checkout session; `POST /billing/webhook` → `StripeWebhookProcessor` activates it automatically
 * once checkout completes and keeps `currentPeriodEnd` in sync on every real Stripe renewal —
 * kept deliberately separate from that processor's business-plan path (disambiguated by real
 * `membershipId` metadata) so a membership event can never be mistaken for — or corrupt — the
 * business's own subscription state. `POST /memberships/:id/activate` still exists as a manual
 * fallback for a business without webhooks configured.
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly billing: BillingService,
  ) {}

  createPlan(dto: CreateMembershipPlanDto) {
    return this.tenantPrisma.client.membershipPlan.create({
      data: {
        name: dto.name,
        price: dto.price,
        interval: dto.interval,
        benefits: dto.benefits,
        stripePriceId: dto.stripePriceId,
      } as Prisma.MembershipPlanUncheckedCreateInput,
    });
  }

  listPlans() {
    return this.tenantPrisma.client.membershipPlan.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(businessId: string, dto: CreateMembershipDto) {
    const plan = await this.findPlan(dto.planId);
    const customer = await this.tenantPrisma.client.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (dto.method === 'cash') {
      // Membership depth fix (UPD-INT-007) — cash memberships have no gateway to auto-charge,
      // so "charges on schedule" for them means an honest renewal-due date, real enough to drive
      // a real lapse job (`MembershipRenewalProcessor`), rather than staying "active" forever
      // with zero indication a renewal payment was ever due.
      const membership = await this.tenantPrisma.client.membership.create({
        data: {
          businessId,
          planId: dto.planId,
          customerId: dto.customerId,
          status: MembershipStatus.active,
          method: 'cash',
          currentPeriodEnd: nextPeriodEnd(new Date(), plan.interval),
        },
      });
      return { membership, checkoutUrl: null as string | null };
    }

    if (!plan.stripePriceId) {
      throw new AppException(
        MEMBERSHIP_ERROR_CODES.ONLINE_NOT_CONFIGURED,
        `Plan "${plan.name}" has no Stripe price configured for online billing yet — use "cash" for now`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!dto.successUrl || !dto.cancelUrl) {
      throw new AppException(
        MEMBERSHIP_ERROR_CODES.ONLINE_NOT_CONFIGURED,
        'successUrl and cancelUrl are required for an online membership',
        HttpStatus.BAD_REQUEST,
      );
    }

    const membership = await this.tenantPrisma.client.membership.create({
      data: {
        businessId,
        planId: dto.planId,
        customerId: dto.customerId,
        status: MembershipStatus.pending,
        method: 'online',
      },
    });

    const session = await this.billing.createSubscriptionCheckout({
      referenceId: membership.id,
      referenceKey: 'membershipId',
      customerEmail: customer.email ?? undefined,
      priceRef: plan.stripePriceId,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
    });

    return { membership, checkoutUrl: session.url };
  }

  listMemberships(customerId?: string) {
    return this.tenantPrisma.client.membership.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true, customer: true },
    });
  }

  async activate(id: string) {
    const membership = await this.findMembership(id);
    if (membership.status !== MembershipStatus.pending) {
      throw new AppException(
        MEMBERSHIP_ERROR_CODES.ALREADY_TERMINAL,
        `Membership is "${membership.status}", expected "pending"`,
        HttpStatus.CONFLICT,
      );
    }
    return this.tenantPrisma.client.membership.update({
      where: { id },
      data: { status: MembershipStatus.active },
    });
  }

  /** Membership depth fix — a cash membership's real renewal action: staff collects the next
   * period's cash payment and records it here, extending the real due date. Also reactivates a
   * membership the expiry job already lapsed, since a late cash payment still counts. */
  async renewCash(id: string) {
    const membership = await this.tenantPrisma.client.membership.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    if (membership.method !== 'cash') {
      throw new AppException(
        MEMBERSHIP_ERROR_CODES.ALREADY_TERMINAL,
        'Only a cash membership can be renewed this way — an online membership renews automatically via Stripe',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (membership.status === MembershipStatus.cancelled) {
      throw new AppException(
        MEMBERSHIP_ERROR_CODES.ALREADY_TERMINAL,
        'This membership was cancelled and cannot be renewed',
        HttpStatus.CONFLICT,
      );
    }

    const renewFrom =
      membership.currentPeriodEnd && membership.currentPeriodEnd > new Date()
        ? membership.currentPeriodEnd
        : new Date();

    return this.tenantPrisma.client.membership.update({
      where: { id },
      data: {
        status: MembershipStatus.active,
        currentPeriodEnd: nextPeriodEnd(renewFrom, membership.plan.interval),
      },
    });
  }

  async cancel(id: string) {
    const membership = await this.findMembership(id);
    if (
      membership.status === MembershipStatus.cancelled ||
      membership.status === MembershipStatus.expired
    ) {
      throw new AppException(
        MEMBERSHIP_ERROR_CODES.ALREADY_TERMINAL,
        `Membership is already "${membership.status}"`,
        HttpStatus.CONFLICT,
      );
    }

    // Real Stripe cancellation, not swallowed — if this throws, the membership stays as-is
    // rather than the local status silently drifting from what Stripe still thinks is active.
    if (membership.stripeSubscriptionId) {
      await this.billing.cancelSubscription(membership.stripeSubscriptionId);
    }

    return this.tenantPrisma.client.membership.update({
      where: { id },
      data: { status: MembershipStatus.cancelled },
    });
  }

  private async findPlan(id: string) {
    const plan = await this.tenantPrisma.client.membershipPlan.findUnique({
      where: { id },
    });
    if (!plan) {
      throw new AppException(
        MEMBERSHIP_ERROR_CODES.PLAN_NOT_FOUND,
        'Membership plan not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return plan;
  }

  private async findMembership(id: string) {
    const membership = await this.tenantPrisma.client.membership.findUnique({
      where: { id },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    return membership;
  }
}
