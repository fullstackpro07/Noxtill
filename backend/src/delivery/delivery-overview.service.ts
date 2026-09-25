import { startOfDayInZone } from './delivery-time.util';
import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { DeliverySettingsService } from './delivery-settings.service';
import { RidersService, riderDisplayStatus } from './riders.service';
import { RoutingService } from './routing.service';
import { ACTIVE_DELIVERY_STATUSES } from './delivery.constants';
import { DeliveryStatus, Prisma } from '@prisma/client';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function minutesAgo(date: Date): number {
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? round2((sorted[mid - 1] + sorted[mid]) / 2)
    : round2(sorted[mid]);
}

const DELIVERY_ORDER_INCLUDE = {
  order: { include: { customer: true, items: true } },
  rider: true,
  zone: true,
} satisfies Prisma.DeliveryInclude;
type DeliveryWithOrder = Prisma.DeliveryGetPayload<{
  include: typeof DELIVERY_ORDER_INCLUDE;
}>;

/**
 * Delivery module redesign — everything the Overview and Live Dispatch screens show, computed
 * from real rows every time (no cached/estimated figures). Anything the schema genuinely has no
 * data for (a delivery fee actually charged, what a delivery cost to fulfil) is returned as
 * `null`/`'not_tracked'` rather than a fabricated number — the frontend renders those honestly.
 */
@Injectable()
export class DeliveryOverviewService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly deliverySettings: DeliverySettingsService,
    private readonly riders: RidersService,
    private readonly routing: RoutingService,
  ) {}

  /** Start of the business's own calendar day (its timezone, not the server's). */
  private async startOfDay(businessId: string): Promise<Date> {
    const b = await this.tenantPrisma.client.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    return startOfDayInZone(b?.timezone ?? 'UTC');
  }

  private deliveryCode(orderNo: number): string {
    return `DEL-${orderNo}`;
  }

  private async range(
    period: string,
    businessId: string,
  ): Promise<{ from: Date; to: Date; label: string }> {
    const start = await this.startOfDay(businessId);
    const day = 24 * 60 * 60 * 1000;
    const now = new Date();
    switch (period) {
      case 'yesterday':
        return {
          from: new Date(start.getTime() - day),
          to: start,
          label: 'yesterday',
        };
      case 'week':
        return {
          from: new Date(now.getTime() - 7 * day),
          to: now,
          label: 'in the last 7 days',
        };
      case 'month':
        return {
          from: new Date(now.getTime() - 30 * day),
          to: now,
          label: 'in the last 30 days',
        };
      default:
        return { from: start, to: now, label: 'so far today' };
    }
  }

  async kpis(businessId: string, period = 'today') {
    const {
      from: startOfDay,
      to: rangeEnd,
      label: periodLabel,
    } = await this.range(period, businessId);
    const periodName =
      period === 'yesterday'
        ? 'Yesterday'
        : period === 'week'
          ? 'Last 7 days'
          : period === 'month'
            ? 'Last 30 days'
            : 'Today';
    const allRiders = await this.tenantPrisma.client.rider.findMany({
      where: { businessId },
    });
    const enrichedRiders = await this.riders.enrich(allRiders);
    const activeRiders = enrichedRiders.filter((r) => r.status === 'active');
    const staleRiders = activeRiders.filter(
      (r) => r.stale && r.displayStatus !== 'On break',
    );
    const totalCashHeld = round2(
      enrichedRiders.reduce((sum, r) => sum + r.cashHeld, 0),
    );

    const [
      deliveriesToday,
      waiting,
      outForDelivery,
      deliveredToday,
      failedToday,
      activeNotLate,
    ] = await Promise.all([
      this.tenantPrisma.client.delivery.count({
        where: { businessId, createdAt: { gte: startOfDay, lt: rangeEnd } },
      }),
      this.tenantPrisma.client.delivery.count({
        where: { businessId, status: DeliveryStatus.unassigned },
      }),
      this.tenantPrisma.client.delivery.count({
        where: {
          businessId,
          status: { in: [...ACTIVE_DELIVERY_STATUSES] },
        },
      }),
      this.tenantPrisma.client.delivery.findMany({
        where: {
          businessId,
          status: DeliveryStatus.delivered,
          deliveredAt: { gte: startOfDay, lt: rangeEnd },
        },
        select: {
          assignedAt: true,
          deliveredAt: true,
          deliveryFee: true,
          deliveryCost: true,
        },
      }),
      // Delivery has no dedicated `failedAt` column; `updatedAt` at the moment a delivery is
      // marked failed is the real timestamp of that transition (status only ever moves forward,
      // so it isn't touched again afterwards) — a real proxy, not a fabricated one.
      this.tenantPrisma.client.delivery.count({
        where: {
          businessId,
          status: DeliveryStatus.failed,
          updatedAt: { gte: startOfDay, lt: rangeEnd },
        },
      }),
      this.tenantPrisma.client.delivery.findMany({
        where: {
          businessId,
          status: { in: [...ACTIVE_DELIVERY_STATUSES] },
          promisedAt: { not: null },
        },
        select: { promisedAt: true },
      }),
    ]);

    const now = Date.now();
    const lateDeliveries = activeNotLate.filter(
      (d) => d.promisedAt !== null && d.promisedAt.getTime() < now,
    );
    const worstLateMinutes =
      lateDeliveries.length > 0
        ? Math.max(
            ...lateDeliveries.map((d) =>
              Math.round((now - d.promisedAt!.getTime()) / 60000),
            ),
          )
        : null;

    const doorToDoorMinutes = median(
      deliveredToday
        .filter((d) => d.assignedAt && d.deliveredAt)
        .map(
          (d) => (d.deliveredAt!.getTime() - d.assignedAt!.getTime()) / 60000,
        ),
    );

    const onTime = await this.onTimeRateSince(businessId, startOfDay, rangeEnd);
    const feeRows = deliveredToday.filter((d) => d.deliveryFee !== null);
    const costRows = deliveredToday.filter((d) => d.deliveryCost !== null);
    const feesTotal = feeRows.reduce((a, d) => a + Number(d.deliveryFee), 0);
    const costTotal = costRows.reduce((a, d) => a + Number(d.deliveryCost), 0);

    return [
      {
        key: 'generic',
        l:
          period === 'today'
            ? 'Deliveries today'
            : `Deliveries (${periodName.toLowerCase()})`,
        v: String(deliveriesToday),
        sub: `${deliveredToday.length} delivered ${periodLabel}`,
        color: '#0F172A',
        bd: '#E6EAF0',
      },
      {
        key: 'generic',
        l: 'Waiting for a rider',
        v: String(waiting),
        sub: waiting > 0 ? 'needs dispatch' : 'nothing waiting',
        color: waiting > 0 ? '#B42318' : '#0F172A',
        bd: waiting > 0 ? '#FDD9D6' : '#E6EAF0',
      },
      {
        key: 'generic',
        l: 'Out for delivery',
        v: String(outForDelivery),
        sub: `across ${activeRiders.filter((r) => r.activeDeliveries > 0).length} riders`,
        color: '#0F172A',
        bd: '#E6EAF0',
      },
      {
        key: 'generic',
        l: 'Delivered',
        v: String(deliveredToday.length),
        sub: periodLabel,
        color: '#12A150',
        bd: '#BFE7CF',
      },
      {
        key: 'delayed',
        l: 'Running late',
        v: String(lateDeliveries.length),
        sub:
          worstLateMinutes !== null
            ? `worst is ${worstLateMinutes} min over`
            : 'none right now',
        color: lateDeliveries.length > 0 ? '#B42318' : '#0F172A',
        bd: lateDeliveries.length > 0 ? '#FDD9D6' : '#E6EAF0',
      },
      {
        key: 'generic',
        l: period === 'today' ? 'Failed today' : 'Failed',
        v: String(failedToday),
        sub: failedToday > 0 ? 'needs a retry decision' : 'none today',
        color: failedToday > 0 ? '#B54708' : '#0F172A',
        bd: '#E6EAF0',
      },
      {
        key: 'generic',
        l: 'Typical door-to-door',
        v:
          doorToDoorMinutes !== null
            ? `${Math.round(doorToDoorMinutes)} min`
            : 'Not enough data',
        sub:
          doorToDoorMinutes !== null
            ? 'median today, assigned to delivered'
            : 'no delivery finished today yet',
        color: '#0F172A',
        bd: '#E6EAF0',
      },
      {
        key: 'generic',
        l: 'Arrived on time',
        v:
          onTime.rate !== null
            ? `${Math.round(onTime.rate)}%`
            : 'Not enough data',
        sub:
          onTime.sampleSize > 0
            ? `of ${onTime.sampleSize} with a real promise`
            : 'no delivery with a promise yet today',
        color: onTime.rate !== null && onTime.rate < 90 ? '#B54708' : '#0F172A',
        bd: '#E6EAF0',
      },
      {
        key: 'generic',
        l: 'Delivery fees taken',
        v:
          feeRows.length > 0
            ? `Rs. ${Math.round(feesTotal).toLocaleString('en-US')}`
            : 'None quoted',
        sub:
          feeRows.length > 0
            ? `from ${feeRows.length} deliveries`
            : 'no delivered order has a zone fee yet',
        color: feeRows.length > 0 ? '#0F172A' : '#98A2B3',
        bd: '#E6EAF0',
      },
      {
        key: 'generic',
        l: 'What delivery cost you',
        v:
          costRows.length > 0
            ? `Rs. ${Math.round(costTotal).toLocaleString('en-US')}`
            : 'Not configured',
        sub:
          costRows.length > 0
            ? 'fuel and rider pay, from your settings'
            : 'set a dispatch hub and cost model in Settings',
        color:
          costRows.length > 0
            ? costTotal > feesTotal
              ? '#B54708'
              : '#0F172A'
            : '#98A2B3',
        bd: '#E6EAF0',
      },
      {
        key: 'cash',
        l: 'Cash to collect',
        v: `Rs. ${Math.round(totalCashHeld).toLocaleString('en-US')}`,
        sub: `held by ${enrichedRiders.filter((r) => r.cashHeld > 0).length} riders`,
        color: totalCashHeld > 0 ? '#B42318' : '#0F172A',
        bd: totalCashHeld > 0 ? '#FDD9D6' : '#E6EAF0',
      },
      {
        key: 'generic',
        l: 'Riders on shift',
        v: String(activeRiders.length),
        sub:
          staleRiders.length > 0
            ? `${staleRiders.length} has no signal`
            : 'all reporting',
        color: '#0F172A',
        bd: '#E6EAF0',
      },
    ];
  }

  private async onTimeRateSince(businessId: string, since: Date, until: Date) {
    const candidates = await this.tenantPrisma.client.delivery.findMany({
      where: {
        businessId,
        promisedAt: { not: null },
        status: { in: [DeliveryStatus.delivered, DeliveryStatus.failed] },
        OR: [
          { deliveredAt: { gte: since, lt: until } },
          { updatedAt: { gte: since, lt: until } },
        ],
      },
      select: { status: true, deliveredAt: true, promisedAt: true },
    });
    const onTime = candidates.filter(
      (d) =>
        d.status === DeliveryStatus.delivered &&
        d.deliveredAt &&
        d.promisedAt &&
        d.deliveredAt.getTime() <= d.promisedAt.getTime(),
    ).length;
    return {
      rate:
        candidates.length > 0
          ? round2((onTime / candidates.length) * 100)
          : null,
      sampleSize: candidates.length,
    };
  }

  async funnel(businessId: string) {
    const startOfDay = await this.startOfDay(businessId);
    const [packing, readyNoRider, assigned, pickedUp, enRoute, delivered] =
      await Promise.all([
        this.tenantPrisma.client.order.count({
          where: {
            businessId,
            orderType: 'delivery',
            createdAt: { gte: startOfDay },
            delivery: { is: null },
          },
        }),
        this.tenantPrisma.client.delivery.count({
          where: { businessId, status: DeliveryStatus.unassigned },
        }),
        this.tenantPrisma.client.delivery.count({
          where: { businessId, status: DeliveryStatus.assigned },
        }),
        this.tenantPrisma.client.delivery.count({
          where: { businessId, status: DeliveryStatus.picked_up },
        }),
        this.tenantPrisma.client.delivery.count({
          where: { businessId, status: DeliveryStatus.en_route },
        }),
        this.tenantPrisma.client.delivery.count({
          where: {
            businessId,
            status: DeliveryStatus.delivered,
            deliveredAt: { gte: startOfDay },
          },
        }),
      ]);
    const stages: Array<{ l: string; v: number; c: string }> = [
      { l: 'Being packed', v: packing, c: '#C7D7FE' },
      { l: 'Ready, no rider', v: readyNoRider, c: '#FEC84B' },
      { l: 'Rider assigned', v: assigned, c: '#A4BCFD' },
      { l: 'Picked up', v: pickedUp, c: '#8098F9' },
      { l: 'Nearly there', v: enRoute, c: '#6CD49A' },
      { l: 'Delivered', v: delivered, c: '#12A150' },
    ];
    const max = Math.max(1, ...stages.map((s) => s.v));
    return stages.map((s) => ({
      l: s.l,
      v: String(s.v),
      w: `${Math.max(4, Math.round((s.v / max) * 100))}%`,
      c: s.c,
    }));
  }

  /** Riders + delivery destinations with a real GPS fix, projected onto the map's fixed viewBox around their own real centroid — never placed at a fabricated position. */
  async map(businessId: string) {
    const settingsForHub = await this.deliverySettings.get(businessId);
    const realHub =
      settingsForHub.hubLat !== null && settingsForHub.hubLng !== null
        ? {
            lat: Number(settingsForHub.hubLat),
            lng: Number(settingsForHub.hubLng),
          }
        : null;
    const [riders, activeDeliveries] = await Promise.all([
      this.tenantPrisma.client.rider.findMany({
        where: {
          businessId,
          status: 'active',
          lastLat: { not: null },
          lastLng: { not: null },
        },
      }),
      this.tenantPrisma.client.delivery.findMany({
        where: {
          businessId,
          status: {
            in: [DeliveryStatus.unassigned, ...ACTIVE_DELIVERY_STATUSES],
          },
          lat: { not: null },
          lng: { not: null },
        },
        include: { order: true },
      }),
    ]);

    const points: { lat: number; lng: number }[] = [
      ...(realHub ? [realHub] : []),
      ...riders.map((r) => ({
        lat: Number(r.lastLat),
        lng: Number(r.lastLng),
      })),
      ...activeDeliveries.map((d) => ({
        lat: Number(d.lat),
        lng: Number(d.lng),
      })),
    ];
    if (points.length === 0) {
      return {
        hub: null,
        hubPin: null,
        hubIsReal: false,
        pins: [],
        legend: [],
      };
    }

    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const hub = {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
    };
    // A degenerate box (a single real point, or all points identical) would divide by zero —
    // fall back to a small fixed span so a lone rider still renders centred rather than crashing.
    const latSpan = Math.max(maxLat - minLat, 0.01) * 1.4;
    const lngSpan = Math.max(maxLng - minLng, 0.01) * 1.4;

    const project = (lat: number, lng: number) => ({
      left: `${round2(((lng - hub.lng) / lngSpan + 0.5) * 100)}%`,
      top: `${round2((1 - ((lat - hub.lat) / latSpan + 0.5)) * 100)}%`,
    });

    const settings = await this.deliverySettings.get(businessId);
    const riderPins = riders.map((r) => {
      const status = riderDisplayStatus(
        r,
        activeDeliveries.filter((d) => d.riderId === r.id).length,
        settings.staleLocationMinutes,
      );
      const bg =
        status === 'No signal'
          ? '#B42318'
          : status === 'On break'
            ? '#B54708'
            : status === 'On delivery'
              ? '#12A150'
              : '#3538CD';
      const initials = r.name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      return {
        i: r.id,
        kind: 'rider' as const,
        ...project(Number(r.lastLat), Number(r.lastLng)),
        bg,
        radius: '20px',
        label: initials,
        aria: `${r.name}, ${status.toLowerCase()}`,
      };
    });
    const nowMs = Date.now();
    const isLate = (d: (typeof activeDeliveries)[number]) =>
      d.status !== DeliveryStatus.unassigned &&
      d.promisedAt !== null &&
      d.promisedAt.getTime() < nowMs;
    const lateRiderIds = new Set(
      activeDeliveries.filter(isLate).map((d) => d.riderId),
    );
    const unassignedPins = activeDeliveries
      .filter((d) => d.status === DeliveryStatus.unassigned)
      .map((d) => ({
        i: d.id,
        kind: 'delivery' as const,
        late: false,
        unassigned: true,
        ...project(Number(d.lat), Number(d.lng)),
        bg: '#98A2B3',
        radius: '9px',
        label: this.deliveryCode(d.order.orderNo),
        aria: `Unassigned delivery ${this.deliveryCode(d.order.orderNo)}`,
      }));
    const latePins = activeDeliveries.filter(isLate).map((d) => ({
      i: d.id,
      kind: 'delivery' as const,
      late: true,
      unassigned: false,
      ...project(Number(d.lat), Number(d.lng)),
      bg: '#B42318',
      radius: '9px',
      label: '!',
      aria: `Late delivery ${this.deliveryCode(d.order.orderNo)}`,
    }));
    const riderPinsMarked = riderPins.map((p) => ({
      ...p,
      late: lateRiderIds.has(p.i),
      unassigned: false,
    }));

    return {
      hub,
      hubPin: realHub
        ? project(realHub.lat, realHub.lng)
        : { left: '50%', top: '50%' },
      hubIsReal: realHub !== null,
      // Unassigned-delivery pins are drawn first so a rider pin (the more important "who is here"
      // signal) always paints on top when both happen to project to the same spot.
      pins: [...unassignedPins, ...latePins, ...riderPinsMarked],
      legend: [
        { c: '#12A150', l: 'On delivery' },
        { c: '#3538CD', l: 'Available' },
        { c: '#B42318', l: 'No signal' },
        { c: '#98A2B3', l: 'Unassigned' },
        { c: '#B42318', l: 'Late delivery (!)' },
      ],
    };
  }

  async intel(businessId: string) {
    const [settings, allRiders, queue] = await Promise.all([
      this.deliverySettings.get(businessId),
      this.tenantPrisma.client.rider.findMany({
        where: { businessId, status: 'active' },
      }),
      this.tenantPrisma.client.delivery.findMany({
        where: { businessId, status: DeliveryStatus.unassigned },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const enriched = await this.riders.enrich(allRiders);

    const items: Array<{
      kind: string;
      bg: string;
      fg: string;
      basis: string;
      t: string;
      ev: string;
      why: string;
      action: {
        kind: 'call' | 'handin' | 'assign' | 'dispatch';
        label: string;
        phone?: string;
        riderId?: string;
        deliveryId?: string;
      };
    }> = [];

    for (const r of enriched.filter(
      (x) => x.activeDeliveries >= settings.warnAtStopCount,
    )) {
      items.push({
        kind: 'Overloaded',
        bg: '#FEF3F2',
        fg: '#B42318',
        basis: 'Counted from live records',
        t: `${r.name} has ${r.activeDeliveries} stops queued`,
        ev: `${r.activeDeliveries} active deliveries against a warning threshold of ${settings.warnAtStopCount}, set in Settings`,
        why: `They have ${r.activeDeliveries} stops in progress against the ${settings.warnAtStopCount}-stop warning threshold set in Settings. Reassigning some of their load to a rider with spare capacity keeps the rest of their deliveries on time.`,
        action: { kind: 'dispatch', label: 'Open Live Dispatch' },
      });
    }
    for (const r of enriched.filter(
      (x) => x.stale && x.displayStatus !== 'On break',
    )) {
      const minutes = r.lastLocationAt
        ? minutesAgo(new Date(r.lastLocationAt))
        : null;
      items.push({
        kind: 'No signal',
        bg: '#FEF3F2',
        fg: '#B42318',
        basis: 'Counted from live records',
        t: `${r.name} has not reported a position${minutes !== null ? ` for ${minutes} minutes` : ''}`,
        ev: `${r.activeDeliveries} active ${r.activeDeliveries === 1 ? 'stop' : 'stops'}${r.cashHeld > 0 ? ` and Rs. ${Math.round(r.cashHeld).toLocaleString('en-US')} in cash` : ''} are with them`,
        why: `Their phone has stopped sending location updates${minutes !== null ? ` (last fix ${minutes} minutes ago)` : ''}. This is usually a flat battery or a dead spot, but the map position is now guesswork until they report again.`,
        action: { kind: 'call', label: `Call ${r.name}`, phone: r.phone },
      });
    }
    if (queue.length > 0) {
      const oldest = minutesAgo(queue[0].createdAt);
      const available = enriched.filter(
        (r) => r.displayStatus === 'Available',
      ).length;
      items.push({
        kind: 'Unassigned',
        bg: '#FEF6E7',
        fg: '#B54708',
        basis: 'Counted from live records',
        t: `${queue.length} order${queue.length === 1 ? ' is' : 's are'} waiting, one for ${oldest} minutes`,
        ev: `${available} rider${available === 1 ? '' : 's'} currently free`,
        why: `${queue.length} order${queue.length === 1 ? ' has' : 's have'} no rider yet, the oldest waiting ${oldest} minutes. ${available > 0 ? `${available} rider${available === 1 ? ' is' : 's are'} currently free to take one.` : 'No rider is currently free — this will keep waiting until one is.'}`,
        action: {
          kind: 'assign',
          label: 'Review the suggested assignment',
          deliveryId: queue[0].id,
        },
      });
    }
    if (settings.cashLimitAmount !== null) {
      for (const r of enriched.filter(
        (x) => x.cashHeld > Number(settings.cashLimitAmount),
      )) {
        items.push({
          kind: 'Cash',
          bg: '#FEF6E7',
          fg: '#B54708',
          basis: 'Counted from live records',
          t: `${r.name} is carrying more cash than your comfort limit`,
          ev: `Rs. ${Math.round(r.cashHeld).toLocaleString('en-US')} against a Rs. ${Math.round(Number(settings.cashLimitAmount)).toLocaleString('en-US')} limit set in Settings`,
          why: `They have Rs. ${Math.round(r.cashHeld).toLocaleString('en-US')} collected against the Rs. ${Math.round(Number(settings.cashLimitAmount)).toLocaleString('en-US')} limit you set. That is a safety question rather than an accounting one — the money is recorded either way.`,
          action: {
            kind: 'handin',
            label: `Record ${r.name}'s cash hand-in`,
            riderId: r.id,
          },
        });
      }
    }

    return items.map((item, i) => ({ i, ...item }));
  }

  async activityFeed(businessId: string, limit = 8) {
    const events = await this.tenantPrisma.client.activityEvent.findMany({
      where: { businessId, type: 'delivery' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return events.map((e) => {
      const d = e.description.toLowerCase();
      let bg = '#F2F4F7';
      let fg = '#475467';
      let icon = 'M12 5v14M5 12h14';
      if (d.includes('delivered')) {
        bg = '#E8F7EE';
        fg = '#0E8442';
        icon = 'm5 13 4 4L19 7';
      } else if (d.includes('failed')) {
        bg = '#FEF3F2';
        fg = '#B42318';
        icon =
          'M12 9v5M12 17.5h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z';
      } else if (d.includes('handed in')) {
        bg = '#E8F7EE';
        fg = '#0E8442';
        icon =
          'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6.5v11M14 9.5A2.6 2.6 0 0 0 11.5 8';
      } else if (d.includes('new delivery')) {
        bg = '#EEF4FF';
        fg = '#3538CD';
        icon = 'M12 5v14M5 12h14';
      } else if (d.includes('assigned')) {
        bg = '#EEF4FF';
        fg = '#3538CD';
        icon = 'M9 11l3 3L22 4';
      }
      return {
        t: e.description,
        when: `${minutesAgo(e.createdAt)} min ago`,
        bg,
        fg,
        icon,
      };
    });
  }

  private async allRidersEnriched(businessId: string) {
    const allRiders = await this.tenantPrisma.client.rider.findMany({
      where: { businessId },
    });
    return this.riders.enrich(allRiders);
  }

  async ridersLive(businessId: string) {
    const settings = await this.deliverySettings.get(businessId);
    const enriched = (await this.allRidersEnriched(businessId)).filter(
      (r) => r.status === 'active',
    );
    return enriched.map((r) => {
      const cap = settings.warnAtStopCount;
      const pct = cap > 0 ? Math.round((r.activeDeliveries / cap) * 100) : 0;
      const c = statusChip(r.displayStatus);
      const initials = r.name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      return {
        i: r.id,
        n: r.name,
        init: initials,
        zone: r.zoneName ?? 'No zone set',
        st: r.displayStatus,
        bg: c.bg,
        fg: c.fg,
        stops: r.activeDeliveries,
        cap,
        cash: round2(r.cashHeld),
        loadW: `${Math.min(100, pct)}%`,
        loadColor: pct >= 85 ? '#B42318' : pct >= 60 ? '#B54708' : '#12A150',
        stale: r.stale,
        seen: r.lastLocationAt
          ? `${minutesAgo(new Date(r.lastLocationAt))} min ago`
          : 'never',
      };
    });
  }

  /** Real "best fit" suggestion for one waiting order — same load-balancing signal `DeliveryAssignmentService` uses, extended with real distance/zone reasoning where a rider's GPS position is known. */
  private bestFit(
    delivery: DeliveryWithOrder,
    candidates: Awaited<ReturnType<RidersService['enrich']>>,
  ) {
    const eligible = candidates.filter(
      (r) =>
        r.displayStatus === 'Available' || r.displayStatus === 'On delivery',
    );
    if (eligible.length === 0) return null;

    const hasDeliveryLocation = delivery.lat !== null && delivery.lng !== null;
    const scored = eligible.map((r) => {
      const hasRiderLocation = r.lastLat !== null && r.lastLng !== null;
      const distanceKm =
        hasDeliveryLocation && hasRiderLocation
          ? round2(
              this.routing.haversineKm(
                { lat: Number(delivery.lat), lng: Number(delivery.lng) },
                { lat: Number(r.lastLat), lng: Number(r.lastLng) },
              ),
            )
          : null;
      const sameZone =
        r.zoneName && delivery.zone?.name && r.zoneName === delivery.zone.name;
      return { r, distanceKm, sameZone };
    });
    scored.sort((a, b) => {
      if (a.distanceKm !== null && b.distanceKm !== null)
        return a.distanceKm - b.distanceKm;
      if (a.distanceKm !== null) return -1;
      if (b.distanceKm !== null) return 1;
      return a.r.activeDeliveries - b.r.activeDeliveries;
    });
    const best = scored[0];
    const reasons: string[] = [];
    if (best.distanceKm !== null) reasons.push(`${best.distanceKm} km away`);
    reasons.push(
      `${best.r.activeDeliveries} stop${best.r.activeDeliveries === 1 ? '' : 's'} in progress`,
    );
    if (best.sameZone) reasons.push('same zone');
    return { rider: best.r, why: reasons.join(', ') };
  }

  async queue(businessId: string) {
    const [deliveries, allRiders] = await Promise.all([
      this.tenantPrisma.client.delivery.findMany({
        where: { businessId, status: DeliveryStatus.unassigned },
        orderBy: { createdAt: 'asc' },
        include: DELIVERY_ORDER_INCLUDE,
      }),
      this.tenantPrisma.client.rider.findMany({
        where: { businessId, status: 'active' },
      }),
    ]);
    const enriched = await this.riders.enrich(allRiders);
    const queueRules = await this.deliverySettings.get(businessId);

    return Promise.all(
      deliveries.map(async (d) => {
        const paidSum = (
          await this.tenantPrisma.client.payment.aggregate({
            where: { orderId: d.orderId },
            _sum: { amount: true },
          })
        )._sum.amount;
        const paidTotal = paidSum ? Number(paidSum) : 0;
        const isPaid = paidTotal >= Number(d.order.total);
        const remaining = round2(Number(d.order.total) - paidTotal);
        const waitedMin = minutesAgo(d.createdAt);
        const fit = this.bestFit(d, enriched);

        let pri: 'Urgent' | 'High value' | 'Normal' = 'Normal';
        if (waitedMin >= queueRules.urgentAfterMinutes) pri = 'Urgent';
        else if (
          queueRules.highValueAmount !== null &&
          Number(d.order.total) >= Number(queueRules.highValueAmount)
        )
          pri = 'High value';

        return {
          i: d.id,
          id: this.deliveryCode(d.order.orderNo),
          cust: d.order.customer?.name ?? 'Walk-in customer',
          addr: d.addressLine,
          dist:
            d.distanceKm !== null
              ? `${Number(d.distanceKm)} km from hub`
              : 'Distance unknown',
          items: d.order.items.reduce((sum, item) => sum + item.qty, 0),
          pay: isPaid
            ? 'Paid online'
            : `Rs. ${Math.round(remaining).toLocaleString('en-US')} cash on delivery`,
          paid: isPaid,
          pri,
          waited: `${waitedMin} min`,
          note: d.deliveryNote ?? '',
          rider: fit?.rider.name ?? null,
          riderId: fit?.rider.id ?? null,
          why: fit?.why ?? 'No rider is currently free to take this.',
        };
      }),
    );
  }

  /** Real, in-order rows for the "Running late" KPI drawer. */
  async delayedDeliveries(businessId: string) {
    const now = new Date();
    const late = await this.tenantPrisma.client.delivery.findMany({
      where: {
        businessId,
        status: { in: [...ACTIVE_DELIVERY_STATUSES] },
        promisedAt: { lt: now },
      },
      include: { order: { include: { customer: true } }, rider: true },
      orderBy: { promisedAt: 'asc' },
    });
    return late.map((d) => {
      const lateMinutes = Math.round(
        (now.getTime() - d.promisedAt!.getTime()) / 60000,
      );
      return {
        id: this.deliveryCode(d.order.orderNo),
        cust: d.order.customer?.name ?? 'Walk-in customer',
        amt: `${lateMinutes} min late`,
        note: d.rider
          ? `With ${d.rider.name}, status: ${d.status.replace('_', ' ')}.`
          : 'Not yet assigned to a rider.',
      };
    });
  }

  /** Real "where this data comes from" facts for the fresh-data modal — every timestamp is the real most-recent row, never a fabricated cadence claim. */
  async freshness(businessId: string) {
    const [latestLocation, latestDeliveryUpdate, latestOrder, staleRiders] =
      await Promise.all([
        this.tenantPrisma.client.rider.findFirst({
          where: { businessId, lastLocationAt: { not: null } },
          orderBy: { lastLocationAt: 'desc' },
          select: { lastLocationAt: true },
        }),
        this.tenantPrisma.client.delivery.findFirst({
          where: { businessId },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        this.tenantPrisma.client.order.findFirst({
          where: { businessId, orderType: 'delivery' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.allRidersEnriched(businessId).then((rs) =>
          rs.filter((r) => r.status === 'active' && r.stale),
        ),
      ]);
    const fmt = (d: Date | null | undefined) =>
      d ? `${minutesAgo(d)} min ago` : 'no data yet';
    return {
      rows: [
        {
          l: 'Rider positions',
          v: "Sent by each rider's phone whenever it reports a new position — no fixed interval",
          last: fmt(latestLocation?.lastLocationAt),
          c: latestLocation ? '#0E8442' : '#B42318',
        },
        {
          l: 'Delivery statuses',
          v: "Updated whenever a rider or staff member changes a delivery's status",
          last: fmt(latestDeliveryUpdate?.updatedAt),
          c: latestDeliveryUpdate ? '#0E8442' : '#B42318',
        },
        {
          l: 'Orders coming in',
          v: 'Live from Orders and Fast Sale',
          last: fmt(latestOrder?.createdAt),
          c: latestOrder ? '#0E8442' : '#B42318',
        },
        ...staleRiders.map((r) => ({
          l: r.name,
          v: 'Phone has stopped reporting',
          last: r.lastLocationAt
            ? fmt(new Date(r.lastLocationAt))
            : 'never reported',
          c: '#B42318',
        })),
      ],
    };
  }

  /** Real quick-view for the rider drawer (Overview map pins, Dispatch rider list): today's counts, cash held, real on-time rate, and their real upcoming stops. */
  async riderDetail(businessId: string, riderId: string) {
    const rider = await this.tenantPrisma.client.rider.findFirst({
      where: { id: riderId, businessId },
    });
    if (!rider) return null;
    const startOfDay = await this.startOfDay(businessId);
    const settings = await this.deliverySettings.get(businessId);
    const [enriched] = await this.riders.enrich([rider]);
    const [doneToday, withPromiseToday, next] = await Promise.all([
      this.tenantPrisma.client.delivery.count({
        where: {
          businessId,
          riderId,
          status: DeliveryStatus.delivered,
          deliveredAt: { gte: startOfDay },
        },
      }),
      this.tenantPrisma.client.delivery.findMany({
        where: {
          businessId,
          riderId,
          promisedAt: { not: null },
          status: { in: [DeliveryStatus.delivered, DeliveryStatus.failed] },
          OR: [
            { deliveredAt: { gte: startOfDay } },
            { updatedAt: { gte: startOfDay } },
          ],
        },
        select: { status: true, deliveredAt: true, promisedAt: true },
      }),
      this.tenantPrisma.client.delivery.findMany({
        where: {
          businessId,
          riderId,
          status: { in: [...ACTIVE_DELIVERY_STATUSES] },
        },
        include: { order: { include: { customer: true } } },
        orderBy: { promisedAt: 'asc' },
        take: 5,
      }),
    ]);
    const onTime = withPromiseToday.filter(
      (d) =>
        d.status === DeliveryStatus.delivered &&
        d.deliveredAt &&
        d.promisedAt &&
        d.deliveredAt.getTime() <= d.promisedAt.getTime(),
    ).length;
    const now = Date.now();

    return {
      i: rider.id,
      n: rider.name,
      init: rider.name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      zone: enriched.zoneName ?? 'No zone set',
      veh: rider.vehicleType ?? 'Not set',
      st: enriched.displayStatus,
      bg: statusChip(enriched.displayStatus).bg,
      fg: statusChip(enriched.displayStatus).fg,
      stale: enriched.stale,
      seen: rider.lastLocationAt
        ? `${minutesAgo(rider.lastLocationAt)} min ago`
        : 'never',
      done: doneToday,
      stops: enriched.activeDeliveries,
      otd:
        withPromiseToday.length > 0
          ? `${round2((onTime / withPromiseToday.length) * 100)}%`
          : 'Not enough data',
      cash: `Rs. ${Math.round(enriched.cashHeld).toLocaleString('en-US')}`,
      capacity: settings.warnAtStopCount,
      next: next.map((d, i) => {
        const lateMin = d.promisedAt
          ? Math.round((now - d.promisedAt.getTime()) / 60000)
          : null;
        return {
          n: String(i + 1),
          cust: d.order.customer?.name ?? 'Walk-in customer',
          addr: d.addressLine,
          eta: d.promisedAt
            ? d.promisedAt.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })
            : 'No promise set',
          etaColor: lateMin !== null && lateMin > 0 ? '#B42318' : '#475467',
        };
      }),
    };
  }
}

function statusChip(status: string): { bg: string; fg: string } {
  const map: Record<string, [string, string]> = {
    'On delivery': ['#EEF4FF', '#3538CD'],
    Available: ['#E8F7EE', '#0E8442'],
    'On break': ['#FEF6E7', '#B54708'],
    'No signal': ['#FEF3F2', '#B42318'],
    Offline: ['#F2F4F7', '#475467'],
  };
  const [bg, fg] = map[status] ?? ['#F2F4F7', '#475467'];
  return { bg, fg };
}
