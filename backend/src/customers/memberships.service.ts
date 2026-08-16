import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { BillingService } from '../billing/billing.service';
import { CreateMembershipPlanDto } from './dto/create-membership-plan.dto';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MEMBERSHIP_ERROR_CODES } from './memberships.constants';
import { MembershipStatus, Prisma } from '../../generated/prisma';

/**
 * Membership plans (UPD-BE-025) — a customer-level recurring subscription, separate from the
 * business's own Stripe billing plan. `method: 'cash'` memberships are real and immediate (the
 * business collects payment manually each period, same trust level as CashRegister elsewhere).
 * `method: 'online'` memberships create a real Stripe Checkout session but land `pending` —
 * there's no webhook wired up yet to flip them to `active` automatically (a disclosed gap, kept
 * deliberately separate from `stripe-webhook.processor.ts`'s business-plan path so a membership
 * event can never be mistaken for — or corrupt — the business's own subscription state); staff
 * confirms payment in their Stripe dashboard and calls `POST /memberships/:id/activate`.
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
      const membership = await this.tenantPrisma.client.membership.create({
        data: {
          businessId,
          planId: dto.planId,
          customerId: dto.customerId,
          status: MembershipStatus.active,
          method: 'cash',
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
