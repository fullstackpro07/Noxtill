import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { UpdateDepositSettingsDto } from './dto/update-deposit-settings.dto';
import { DEFAULT_DEPOSIT_SETTINGS } from './bookings.constants';

/**
 * Deposit settings (UPD-BE-091) — one row per business, upsert-on-write (same singleton pattern as
 * `CompetitiveSettingsService`). The shipped capture/refund flow (`DepositsService`) reads nothing
 * from here yet — this is the configuration surface the Deposits screen's settings popup needs;
 * enforcing the trigger rule automatically at booking time is out of scope for this ticket.
 */
@Injectable()
export class DepositSettingsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async get(businessId: string) {
    const existing = await this.tenantPrisma.client.depositSettings.findUnique({
      where: { businessId },
    });
    return existing ?? { businessId, ...DEFAULT_DEPOSIT_SETTINGS };
  }

  async update(businessId: string, dto: UpdateDepositSettingsDto) {
    return this.tenantPrisma.client.depositSettings.upsert({
      where: { businessId },
      create: {
        businessId,
        ...DEFAULT_DEPOSIT_SETTINGS,
        ...dto,
      },
      update: dto,
    });
  }
}
