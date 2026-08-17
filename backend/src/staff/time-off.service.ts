import { Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_USER_ID } from '../common/tenancy/tenant.constants';
import { CreateTimeOffDto } from './dto/create-time-off.dto';

/** UPD-BE-031. Any staff member may request their own time off; approve/reject is owner/manager-only. */
@Injectable()
export class TimeOffService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
  ) {}

  async create(businessId: string, dto: CreateTimeOffDto) {
    let staffUserId = dto.staffUserId;
    if (!staffUserId) {
      const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);
      const businessUser =
        await this.tenantPrisma.client.businessUser.findUnique({
          where: { businessId_userId: { businessId, userId: actorUserId } },
        });
      if (!businessUser) {
        throw new NotFoundException('Staff record not found for this account');
      }
      staffUserId = businessUser.id;
    }

    return this.tenantPrisma.client.timeOff.create({
      data: {
        businessId,
        staffUserId,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        reason: dto.reason,
      },
    });
  }

  list(staffUserId?: string) {
    return this.tenantPrisma.client.timeOff.findMany({
      where: { staffUserId },
      orderBy: { startsAt: 'desc' },
      include: { staffUser: { include: { user: true } } },
    });
  }

  async approve(id: string) {
    const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    await this.findOne(id);
    return this.tenantPrisma.client.timeOff.update({
      where: { id },
      data: { approved: true, reviewedByUserId: actorUserId },
    });
  }

  async reject(id: string) {
    const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    await this.findOne(id);
    return this.tenantPrisma.client.timeOff.update({
      where: { id },
      data: { approved: false, reviewedByUserId: actorUserId },
    });
  }

  async findOne(id: string) {
    const row = await this.tenantPrisma.client.timeOff.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Time off request not found');
    }
    return row;
  }
}
