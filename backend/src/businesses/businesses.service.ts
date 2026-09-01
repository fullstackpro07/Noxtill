import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { UpdateBusinessProfileDto } from './dto/update-business-profile.dto';

const PROFILE_SELECT = {
  id: true,
  name: true,
  phone: true,
  address: true,
  currency: true,
  timezone: true,
  country: true,
  taxLabel: true,
  taxRate: true,
} as const;

/**
 * Business Profile (UPD-FE-M16 fix-it) — the screen editing this was a pure client-side mock
 * before this ticket (hardcoded fake phone/address, a `setTimeout` instead of a real save). This
 * is the first real persistence layer for it. Also the first real persistence for `taxLabel`/
 * `taxRate` (UPD-BE-120) — no endpoint ever wrote to those columns before.
 */
@Injectable()
export class BusinessesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getProfile(businessId: string) {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
      select: PROFILE_SELECT,
    });
    return { ...business, taxRate: Number(business.taxRate) };
  }

  async updateProfile(businessId: string, dto: UpdateBusinessProfileDto) {
    const business = await this.tenantPrisma.client.business.update({
      where: { id: businessId },
      data: dto,
      select: PROFILE_SELECT,
    });
    return { ...business, taxRate: Number(business.taxRate) };
  }
}
