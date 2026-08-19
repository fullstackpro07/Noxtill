import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';

/** Delivery zones & charge rules (UPD-BE-068) — thin settings CRUD, not wired into POS pricing by this ticket. */
@Injectable()
export class DeliveryZonesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list() {
    return this.tenantPrisma.client.deliveryZone.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const zone = await this.tenantPrisma.client.deliveryZone.findUnique({
      where: { id },
    });
    if (!zone) throw new NotFoundException('Delivery zone not found');
    return zone;
  }

  create(businessId: string, dto: CreateDeliveryZoneDto) {
    return this.tenantPrisma.client.deliveryZone.create({
      data: { businessId, ...dto },
    });
  }

  async update(id: string, dto: UpdateDeliveryZoneDto) {
    await this.findOne(id);
    return this.tenantPrisma.client.deliveryZone.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.tenantPrisma.client.deliveryZone.delete({ where: { id } });
    return { success: true };
  }
}
