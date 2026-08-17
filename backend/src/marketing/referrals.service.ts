import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { UpdateReferralSettingsDto } from './dto/update-referral-settings.dto';
import { RedeemReferralDto } from './dto/redeem-referral.dto';
import { Prisma } from '@prisma/client';

/**
 * Minimal shape both the raw PrismaService transaction client and the tenant-extended
 * TenantPrismaService transaction client structurally satisfy — `$extends` wraps the client in a
 * way that isn't nominally assignable to Prisma.TransactionClient, so this is typed against only
 * the handful of operations issueRewardIfEligible actually uses (same pattern as bookings'
 * booking-lock.util.ts SlotLockTx).
 */
interface TxClient {
  customer: {
    findUnique(args: { where: { id: string } }): Promise<{
      id: string;
      referredByCustomerId: string | null;
      referralRewardedAt: Date | null;
      visitCount: number;
    } | null>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
  business: {
    findUniqueOrThrow(args: { where: { id: string } }): Promise<{
      referralSettings: unknown;
    }>;
  };
  creditEntry: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

/**
 * Referrals (BE-062). No separate "referral code" table — every existing
 * customer's own id IS their trackable code (simplest thing that could
 * work; a dedicated code table can be layered on later if codes ever need
 * to be human-typed or revocable). Redeeming a code links the new customer
 * back to their referrer via `Customer.referredByCustomerId`; the stats
 * endpoint is a leaderboard over that link.
 *
 * Reward disbursement is real: issueRewardIfEligible() is called from
 * OrdersService whenever a referred customer's first order completes. For
 * `rewardType: 'credit'`, the referrer is actually credited via CreditEntry
 * (the same mechanism CreditService.recordPayment uses). For `'discount'`,
 * nothing is issued automatically — discounts apply at time of sale, not as
 * a standing ledger credit — the referral is just marked rewarded so it's
 * not double-counted.
 */
@Injectable()
export class ReferralsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Called from OrdersService right after a customer's visitCount is bumped to 1 (their first
   * order). Idempotent via Customer.referralRewardedAt — safe to call on every completed order,
   * it only ever does something the first time for a referred customer.
   */
  async issueRewardIfEligible(
    businessId: string,
    customerId: string,
    tx: TxClient,
  ): Promise<void> {
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
    });
    if (
      !customer ||
      !customer.referredByCustomerId ||
      customer.referralRewardedAt ||
      customer.visitCount !== 1
    ) {
      return;
    }

    const business = await tx.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const settings = business.referralSettings as {
      enabled?: boolean;
      rewardType?: 'credit' | 'discount';
      rewardValue?: number;
    } | null;

    if (
      settings?.enabled &&
      settings.rewardType === 'credit' &&
      settings.rewardValue
    ) {
      await tx.creditEntry.create({
        data: {
          businessId,
          customerId: customer.referredByCustomerId,
          kind: 'credit',
          amount: settings.rewardValue,
          note: 'Referral reward',
        },
      });
    }

    await tx.customer.update({
      where: { id: customerId },
      data: { referralRewardedAt: new Date() },
    });
  }

  async updateSettings(businessId: string, dto: UpdateReferralSettingsDto) {
    await this.tenantPrisma.client.business.update({
      where: { id: businessId },
      data: { referralSettings: dto as unknown as Prisma.InputJsonValue },
    });
    return dto;
  }

  async getSettings(businessId: string) {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    return business.referralSettings;
  }

  async redeem(businessId: string, dto: RedeemReferralDto) {
    const referrer = await this.tenantPrisma.client.customer.findUnique({
      where: { id: dto.code },
    });
    if (!referrer) {
      throw new AppException(
        'REFERRAL_CODE_NOT_FOUND',
        'This referral code does not match any customer',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.tenantPrisma.client.customer.upsert({
      where: { businessId_phone: { businessId, phone: dto.refereePhone } },
      create: {
        businessId,
        phone: dto.refereePhone,
        name: dto.refereeName,
        referredByCustomerId: referrer.id,
      },
      update: { referredByCustomerId: referrer.id },
    });
  }

  async stats() {
    const referred = await this.tenantPrisma.client.customer.findMany({
      where: { referredByCustomerId: { not: null } },
      select: {
        referredByCustomerId: true,
        visitCount: true,
        referralRewardedAt: true,
      },
    });
    const converted = referred.filter((r) => r.visitCount >= 1).length;
    const rewardsIssued = referred.filter(
      (r) => r.referralRewardedAt != null,
    ).length;

    const countsByReferrer = new Map<string, number>();
    for (const row of referred) {
      const key = row.referredByCustomerId!;
      countsByReferrer.set(key, (countsByReferrer.get(key) ?? 0) + 1);
    }

    const referrers = await this.tenantPrisma.client.customer.findMany({
      where: { id: { in: [...countsByReferrer.keys()] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(referrers.map((r) => [r.id, r.name]));

    const leaderboard = [...countsByReferrer.entries()]
      .map(([customerId, count]) => ({
        customerId,
        name: nameById.get(customerId) ?? 'Unknown',
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalReferred: referred.length,
      converted,
      rewardsIssued,
      leaderboard,
    };
  }
}
