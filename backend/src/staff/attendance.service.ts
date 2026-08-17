import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { Prisma } from '@prisma/client';

/** Check-in/out toggle (BE-057) — one open (checkOut=null) row per staff member at a time. */
@Injectable()
export class AttendanceService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async toggle(businessId: string, userId: string) {
    const businessUser = await this.tenantPrisma.client.businessUser.findUnique(
      {
        where: { businessId_userId: { businessId, userId } },
      },
    );
    if (!businessUser) {
      throw new NotFoundException('Staff record not found for this account');
    }

    const open = await this.tenantPrisma.client.attendance.findFirst({
      where: { staffUserId: businessUser.id, checkOut: null },
      orderBy: { checkIn: 'desc' },
    });

    if (open) {
      return this.tenantPrisma.client.attendance.update({
        where: { id: open.id },
        data: { checkOut: new Date() },
      });
    }

    return this.tenantPrisma.client.attendance.create({
      data: {
        staffUserId: businessUser.id,
        checkIn: new Date(),
      } as Prisma.AttendanceUncheckedCreateInput,
    });
  }
}
