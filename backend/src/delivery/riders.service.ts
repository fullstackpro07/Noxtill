import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ActivityPubSubService } from '../activity/activity-pubsub.service';
import { deliveryChannel } from './delivery.constants';
import { CreateRiderDto } from './dto/create-rider.dto';
import { UpdateRiderDto } from './dto/update-rider.dto';
import { RiderLocationDto } from './dto/rider-location.dto';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Riders CRUD + performance aggregation + live location push (UPD-BE-064). */
@Injectable()
export class RidersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly pubsub: ActivityPubSubService,
  ) {}

  list() {
    return this.tenantPrisma.client.rider.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const rider = await this.tenantPrisma.client.rider.findUnique({
      where: { id },
    });
    if (!rider) throw new NotFoundException('Rider not found');
    return rider;
  }

  create(businessId: string, dto: CreateRiderDto) {
    return this.tenantPrisma.client.rider.create({
      data: { businessId, name: dto.name, phone: dto.phone },
    });
  }

  async update(id: string, dto: UpdateRiderDto) {
    await this.findOne(id);
    return this.tenantPrisma.client.rider.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.tenantPrisma.client.rider.delete({ where: { id } });
    return { success: true };
  }

  /** Real per-rider stats: delivered/failed counts, success rate, and average real duration (assign → deliver). */
  async performance(id: string) {
    const rider = await this.findOne(id);
    const deliveries = await this.tenantPrisma.client.delivery.findMany({
      where: { riderId: id },
    });

    const delivered = deliveries.filter((d) => d.status === 'delivered');
    const failed = deliveries.filter((d) => d.status === 'failed');
    const completed = delivered.length + failed.length;

    const durationsMin = delivered
      .filter((d) => d.assignedAt && d.deliveredAt)
      .map(
        (d) =>
          (d.deliveredAt!.getTime() - d.assignedAt!.getTime()) / (60 * 1000),
      );
    const averageDeliveryMinutes =
      durationsMin.length > 0
        ? round2(
            durationsMin.reduce((sum, m) => sum + m, 0) / durationsMin.length,
          )
        : null;

    return {
      riderId: rider.id,
      name: rider.name,
      totalDeliveries: deliveries.length,
      delivered: delivered.length,
      failed: failed.length,
      successRate:
        completed > 0 ? round2((delivered.length / completed) * 100) : null,
      averageDeliveryMinutes,
    };
  }

  /** Real GPS push from the rider's own device — persisted and broadcast for live tracking (UPD-BE-065). */
  async reportLocation(businessId: string, id: string, dto: RiderLocationDto) {
    await this.findOne(id);
    const updated = await this.tenantPrisma.client.rider.update({
      where: { id },
      data: {
        lastLat: dto.lat,
        lastLng: dto.lng,
        lastLocationAt: new Date(),
      },
    });

    await this.pubsub.publish(deliveryChannel(businessId), {
      kind: 'rider_location',
      riderId: id,
      lat: dto.lat,
      lng: dto.lng,
      at: updated.lastLocationAt?.toISOString(),
    });

    return updated;
  }
}
