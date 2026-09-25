import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ActivityPubSubService } from '../activity/activity-pubsub.service';
import { ActivityService } from '../activity/activity.service';
import { DeliverySettingsService } from './delivery-settings.service';
import { startOfDayInZone } from './delivery-time.util';
import {
  deliveryChannel,
  ACTIVE_DELIVERY_STATUSES,
} from './delivery.constants';
import { CreateRiderDto } from './dto/create-rider.dto';
import { UpdateRiderDto } from './dto/update-rider.dto';
import { RiderLocationDto } from './dto/rider-location.dto';
import { DeliveryStatus, Rider } from '@prisma/client';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type RiderDisplayStatus =
  'Offline' | 'On break' | 'On delivery' | 'No signal' | 'Available';

/**
 * Delivery module redesign — a rider's presentation status is entirely derived from real signals
 * (shift state, break toggle, active-delivery count, GPS staleness), never a stored field of its
 * own that could drift from the facts underneath it.
 */
export function riderDisplayStatus(
  rider: Pick<Rider, 'status' | 'onBreakSince' | 'lastLocationAt'>,
  activeDeliveryCount: number,
  staleLocationMinutes: number,
): RiderDisplayStatus {
  if (rider.status !== 'active') return 'Offline';
  if (rider.onBreakSince) return 'On break';
  if (activeDeliveryCount > 0) return 'On delivery';
  const staleMs = staleLocationMinutes * 60 * 1000;
  const isStale =
    !rider.lastLocationAt ||
    Date.now() - rider.lastLocationAt.getTime() > staleMs;
  if (isStale) return 'No signal';
  return 'Available';
}

/** Riders CRUD + performance aggregation + live location push (UPD-BE-064). */
@Injectable()
export class RidersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly pubsub: ActivityPubSubService,
    private readonly activity: ActivityService,
    private readonly deliverySettings: DeliverySettingsService,
  ) {}

  /** Riders screen depth fix (UPD-FE-127) — real "deliveries today" and "currently active" counts alongside each rider, for the roster table. */
  async list() {
    const riders = await this.tenantPrisma.client.rider.findMany({
      orderBy: { name: 'asc' },
    });
    if (riders.length === 0) return [];
    return this.enrich(riders);
  }

  /**
   * Delivery module redesign — every field the Overview/Dispatch/Riders screens show about a
   * rider in one call: real today/active counts, cash held, a real presentation status derived
   * from shift + break + load + GPS staleness (never fabricated), and the zone name resolved from
   * `zoneIds` (a rider may be tagged to more than one zone; the first is shown as their "home" zone).
   */
  async enrich(riders: Rider[]) {
    if (riders.length === 0) return [];
    const businessId = riders[0].businessId;
    const [settings, startOfDay] = [
      await this.deliverySettings.get(businessId),
      startOfDayInZone(
        (
          await this.tenantPrisma.client.business.findUnique({
            where: { id: businessId },
            select: { timezone: true },
          })
        )?.timezone ?? 'UTC',
      ),
    ];
    const riderIds = riders.map((r) => r.id);
    const allZoneIds = [
      ...new Set(
        riders.flatMap((r) =>
          Array.isArray(r.zoneIds) ? (r.zoneIds as string[]) : [],
        ),
      ),
    ];

    const [todayCounts, activeCounts, zones, doneTodayRows, cashRows] =
      await Promise.all([
        this.tenantPrisma.client.delivery.groupBy({
          by: ['riderId'],
          where: { riderId: { in: riderIds }, createdAt: { gte: startOfDay } },
          _count: { riderId: true },
        }),
        this.tenantPrisma.client.delivery.groupBy({
          by: ['riderId'],
          where: {
            riderId: { in: riderIds },
            status: { in: [...ACTIVE_DELIVERY_STATUSES] },
          },
          _count: { riderId: true },
        }),
        this.tenantPrisma.client.deliveryZone.findMany({
          where: {
            id: { in: allZoneIds.length > 0 ? allZoneIds : ['__none__'] },
          },
        }),
        // Real per-rider "delivered today" + "on time today" — grouped in JS since the on-time
        // condition (delivered at/before its own promisedAt) isn't a groupBy-able boolean.
        this.tenantPrisma.client.delivery.findMany({
          where: {
            riderId: { in: riderIds },
            status: { in: ['delivered', 'failed'] },
            OR: [
              { deliveredAt: { gte: startOfDay } },
              { updatedAt: { gte: startOfDay } },
            ],
          },
          select: {
            riderId: true,
            status: true,
            deliveredAt: true,
            promisedAt: true,
          },
        }),
        this.tenantPrisma.client.payment.findMany({
          where: {
            method: 'cash',
            order: {
              delivery: { riderId: { in: riderIds }, status: 'delivered' },
            },
          },
          select: {
            amount: true,
            order: {
              select: {
                delivery: { select: { riderId: true, deliveredAt: true } },
              },
            },
          },
        }),
      ]);
    const todayByRider = new Map(
      todayCounts.map((r) => [r.riderId, r._count.riderId]),
    );
    const activeByRider = new Map(
      activeCounts.map((r) => [r.riderId, r._count.riderId]),
    );
    const zoneNameById = new Map(zones.map((z) => [z.id, z.name]));
    const handedInByRider = new Map(
      riders.map((r) => [r.id, r.cashHandedInAt]),
    );
    const doneTodayByRider = new Map<
      string,
      { done: number; withPromise: number; onTime: number }
    >();
    for (const d of doneTodayRows) {
      if (!d.riderId) continue;
      const bucket = doneTodayByRider.get(d.riderId) ?? {
        done: 0,
        withPromise: 0,
        onTime: 0,
      };
      if (d.status === 'delivered') bucket.done += 1;
      if (d.promisedAt) {
        bucket.withPromise += 1;
        if (
          d.status === 'delivered' &&
          d.deliveredAt &&
          d.deliveredAt.getTime() <= d.promisedAt.getTime()
        ) {
          bucket.onTime += 1;
        }
      }
      doneTodayByRider.set(d.riderId, bucket);
    }
    const cashByRider = new Map<string, number>();
    for (const row of cashRows) {
      const riderId = row.order.delivery?.riderId;
      const deliveredAt = row.order.delivery?.deliveredAt;
      if (!riderId) continue;
      const handedInAt = handedInByRider.get(riderId);
      if (handedInAt && deliveredAt && deliveredAt <= handedInAt) continue;
      cashByRider.set(
        riderId,
        (cashByRider.get(riderId) ?? 0) + Number(row.amount),
      );
    }

    return riders.map((rider) => {
      const activeDeliveries = activeByRider.get(rider.id) ?? 0;
      const riderZoneIds = Array.isArray(rider.zoneIds)
        ? (rider.zoneIds as string[])
        : [];
      const doneToday = doneTodayByRider.get(rider.id);
      return {
        ...rider,
        deliveriesToday: todayByRider.get(rider.id) ?? 0,
        activeDeliveries,
        deliveredToday: doneToday?.done ?? 0,
        onTimeRateToday:
          doneToday && doneToday.withPromise > 0
            ? round2((doneToday.onTime / doneToday.withPromise) * 100)
            : null,
        cashHeld: round2(cashByRider.get(rider.id) ?? 0),
        zoneName:
          riderZoneIds
            .map((id) => zoneNameById.get(id))
            .filter((n): n is string => !!n)[0] ?? null,
        displayStatus: riderDisplayStatus(
          rider,
          activeDeliveries,
          settings.staleLocationMinutes,
        ),
        stale:
          rider.status === 'active' &&
          (!rider.lastLocationAt ||
            Date.now() - rider.lastLocationAt.getTime() >
              settings.staleLocationMinutes * 60 * 1000),
      };
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
      data: {
        businessId,
        name: dto.name,
        phone: dto.phone,
        vehicleType: dto.vehicleType,
        commissionRate: dto.commissionRate,
        zoneIds: dto.zoneIds ?? [],
      },
    });
  }

  async update(id: string, dto: UpdateRiderDto) {
    await this.findOne(id);
    return this.tenantPrisma.client.rider.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        // Going off shift ends location retention: the last GPS fix and any break marker are
        // cleared, so a rider's position is never kept once their shift ends.
        ...(dto.status === 'inactive'
          ? {
              lastLat: null,
              lastLng: null,
              lastLocationAt: null,
              onBreakSince: null,
            }
          : {}),
        ...(dto.vehicleType !== undefined
          ? { vehicleType: dto.vehicleType }
          : {}),
        ...(dto.commissionRate !== undefined
          ? { commissionRate: dto.commissionRate }
          : {}),
        ...(dto.zoneIds !== undefined ? { zoneIds: dto.zoneIds } : {}),
      },
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

    // Riders screen depth fix (UPD-FE-127) — real average of staff-recorded ratings, null (not a
    // fabricated default) until at least one delivery has actually been rated.
    const ratings = deliveries
      .map((d) => d.qualityRating)
      .filter((r): r is number => r != null);
    const averageRating =
      ratings.length > 0
        ? round2(ratings.reduce((sum, r) => sum + r, 0) / ratings.length)
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
      averageRating,
      ratedDeliveries: ratings.length,
    };
  }

  /**
   * Real cash-on-delivery the rider is currently holding: the sum of `cash`-method `Payment`s on
   * their delivered deliveries since their last hand-in (or ever, if they have never handed in).
   * Nothing here is an estimate — every payment counted is a real row against a real delivery this
   * rider actually completed.
   */
  async cashHeld(id: string): Promise<number> {
    const rider = await this.findOne(id);
    const payments = await this.tenantPrisma.client.payment.findMany({
      where: {
        method: 'cash',
        order: {
          delivery: {
            riderId: id,
            status: DeliveryStatus.delivered,
            ...(rider.cashHandedInAt
              ? { deliveredAt: { gt: rider.cashHandedInAt } }
              : {}),
          },
        },
      },
      select: { amount: true },
    });
    return payments.reduce((sum, p) => sum + Number(p.amount), 0);
  }

  /** Marks everything this rider is currently holding as handed in — a real, timestamped reset, not a silent zero. */
  async handInCash(businessId: string, id: string, actorUserId?: string) {
    const held = await this.cashHeld(id);
    const rider = await this.tenantPrisma.client.rider.update({
      where: { id },
      data: { cashHandedInAt: new Date() },
    });
    await this.activity.record(businessId, {
      type: 'delivery',
      description: `${rider.name} handed in ${held > 0 ? `Rs. ${Math.round(held).toLocaleString('en-US')}` : 'their cash (nothing outstanding)'}`,
      amount: held > 0 ? held : undefined,
      entityType: 'Rider',
      entityId: id,
      actorUserId,
    });
    return rider;
  }

  /** The rider's own consent to being shown on a customer's tracking link — off unless explicitly set. */
  async setLocationConsent(id: string, consent: boolean) {
    await this.findOne(id);
    return this.tenantPrisma.client.rider.update({
      where: { id },
      data: { shareLocationConsent: consent },
    });
  }

  /** Real, explicit break toggle — the only real signal behind the design's "On break" status. */
  async setBreak(businessId: string, id: string, onBreak: boolean) {
    const rider = await this.findOne(id);
    return this.tenantPrisma.client.rider.update({
      where: { id: rider.id },
      data: { onBreakSince: onBreak ? new Date() : null },
    });
  }

  /** Real per-rider "on an active delivery right now" load — same count `DeliveryAssignmentService` balances against. */
  async activeLoad(riderIds: string[]): Promise<Map<string, number>> {
    if (riderIds.length === 0) return new Map();
    const counts = await this.tenantPrisma.client.delivery.groupBy({
      by: ['riderId'],
      where: {
        riderId: { in: riderIds },
        status: { in: [...ACTIVE_DELIVERY_STATUSES] },
      },
      _count: { riderId: true },
    });
    return new Map(counts.map((c) => [c.riderId as string, c._count.riderId]));
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
