import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { UpdateReferralSettingsDto } from './dto/update-referral-settings.dto';
import { RedeemReferralDto } from './dto/redeem-referral.dto';
import { Prisma } from '../../generated/prisma';

/**
 * Referrals (BE-062). No separate "referral code" table — every existing
 * customer's own id IS their trackable code (simplest thing that could
 * work; a dedicated code table can be layered on later if codes ever need
 * to be human-typed or revocable). Redeeming a code links the new customer
 * back to their referrer via `Customer.referredByCustomerId`; the stats
 * endpoint is a leaderboard over that link. Reward *disbursement* (crediting
 * the referrer) is deliberately out of scope here — settings only capture
 * what the reward WOULD be so the frontend can display it consistently.
 */
@Injectable()
export class ReferralsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

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
      select: { referredByCustomerId: true },
    });

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
      leaderboard,
    };
  }
}
