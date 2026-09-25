import { startOfDayInZone } from './delivery-time.util';
import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { DeliverySettingsService } from './delivery-settings.service';
import { RidersService } from './riders.service';
import { RoutingService } from './routing.service';
import { DeliveryAutomationsService } from './delivery-automations.service';
import { DeliveryStatus } from '@prisma/client';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
function money(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString('en-US')}`;
}
function avg(values: number[]): number | null {
  return values.length > 0
    ? round2(values.reduce((s, v) => s + v, 0) / values.length)
    : null;
}

/**
 * Delivery module redesign — real data for every table/panel screen that isn't Overview/Dispatch
 * (exceptions, tracking, proof of delivery, analytics, one rider's 360 view, routes, zones,
 * automations). Anything with no real underlying record (a delivery fee actually charged, whether
 * a customer was actually notified, road-accurate route distance) is disclosed as not tracked
 * rather than invented — see the per-method comments for exactly what's real vs disclosed.
 */
@Injectable()
export class DeliveryInsightsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly deliverySettings: DeliverySettingsService,
    private readonly riders: RidersService,
    private readonly routing: RoutingService,
    private readonly automations: DeliveryAutomationsService,
  ) {}

  /** Start of the business's own calendar day (its timezone, not the server's). */
  private async startOfDay(businessId: string): Promise<Date> {
    const b = await this.tenantPrisma.client.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    return startOfDayInZone(b?.timezone ?? 'UTC');
  }
  private code(orderNo: number): string {
    return `DEL-${orderNo}`;
  }

  async exceptions(businessId: string) {
    const startOfDay = await this.startOfDay(businessId);
    const failed = await this.tenantPrisma.client.delivery.findMany({
      where: { businessId, status: DeliveryStatus.failed },
      include: { order: { include: { customer: true } }, rider: true },
      orderBy: { updatedAt: 'desc' },
    });
    const orderIds = failed.map((d) => d.orderId);
    const returns =
      orderIds.length > 0
        ? await this.tenantPrisma.client.return.findMany({
            where: { orderId: { in: orderIds } },
            orderBy: { createdAt: 'desc' },
          })
        : [];
    const returnByOrderId = new Map(returns.map((r) => [r.orderId, r]));

    const rows = failed.map((d) => {
      const ret = returnByOrderId.get(d.orderId);
      const resolved = ret?.status === 'approved';
      return {
        i: d.id,
        cells: {
          id: this.code(d.order.orderNo),
          cust: d.order.customer?.name ?? 'Walk-in customer',
          what: d.failureReason ?? 'Not recorded',
          detail: d.rider
            ? `${d.rider.name} · ${d.updatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
            : d.updatedAt.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              }),
          next: resolved
            ? `${ret.refundAmount ? money(Number(ret.refundAmount)) : ''} refunded via ${ret.refundMethod}`.trim()
            : ret
              ? `Return ${ret.status}`
              : 'Awaiting a decision',
          status: resolved ? 'Resolved' : 'Open',
        },
      };
    });

    const openCount = rows.filter((r) => r.cells.status === 'Open').length;
    // "Resolved today" is when the refund/return was approved, not when the delivery failed.
    const resolvedToday = failed.filter((d) => {
      const ret = returnByOrderId.get(d.orderId);
      return ret?.status === 'approved' && ret.updatedAt >= startOfDay;
    }).length;
    const reasonCounts = new Map<string, number>();
    for (const d of failed.slice(0, 10)) {
      const reason = d.failureReason ?? 'Not recorded';
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
    const mostCommon = [...reasonCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0];
    const valueAtRisk = failed
      .filter((d) => returnByOrderId.get(d.orderId)?.status !== 'approved')
      .reduce((sum, d) => sum + Number(d.order.total), 0);

    return {
      kpis: [
        {
          l: 'Open',
          v: String(openCount),
          sub: openCount > 0 ? 'need a decision' : 'nothing open',
          color: openCount > 0 ? '#B42318' : '#0F172A',
          bd: openCount > 0 ? '#FDD9D6' : '#E6EAF0',
        },
        {
          l: 'Resolved today',
          v: String(resolvedToday),
          sub: 'refunded or rebooked',
          color: '#12A150',
          bd: '#BFE7CF',
        },
        {
          l: 'Most common',
          v: mostCommon ? mostCommon[0] : 'None yet',
          sub: mostCommon
            ? `${mostCommon[1]} of the last ${Math.min(10, failed.length)}`
            : 'no failures recorded',
          color: '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'Value at risk',
          v: money(valueAtRisk),
          sub: 'in open exceptions',
          color: '#B54708',
          bd: '#E6EAF0',
        },
      ],
      rows,
    };
  }

  /**
   * Live tracking — "customer told" has no real signal behind it (this build has no delivery
   * notification/SMS system), so it is honestly disclosed as not tracked rather than a fabricated
   * timestamp. Everything else (against-promise, why) comes from real `promisedAt`/GPS staleness.
   */
  async tracking(businessId: string) {
    const [settings, deliveries] = await Promise.all([
      this.deliverySettings.get(businessId),
      this.tenantPrisma.client.delivery.findMany({
        where: {
          businessId,
          status: { in: ['assigned', 'picked_up', 'en_route'] },
        },
        include: { order: { include: { customer: true } }, rider: true },
        orderBy: { promisedAt: 'asc' },
      }),
    ]);
    const messageIds = deliveries
      .map((d) => d.notificationMessageId)
      .filter((id): id is string => !!id);
    const messages =
      messageIds.length > 0
        ? await this.tenantPrisma.client.message.findMany({
            where: { id: { in: messageIds } },
            select: { id: true, status: true },
          })
        : [];
    const messageStatus = new Map(messages.map((m) => [m.id, m.status]));
    const now = Date.now();
    const rows = deliveries.map((d) => {
      const msg = d.notificationMessageId
        ? messageStatus.get(d.notificationMessageId)
        : undefined;
      const told = !d.customerNotifiedAt
        ? 'Not told yet'
        : msg === 'failed'
          ? 'Message failed to send'
          : msg === 'queued'
            ? 'Message queued'
            : `Told ${d.customerNotifiedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      const staleMs = settings.staleLocationMinutes * 60 * 1000;
      const riderStale =
        !d.rider ||
        !d.rider.lastLocationAt ||
        now - d.rider.lastLocationAt.getTime() > staleMs;
      let against: 'On time' | 'Late' | 'Unknown' = 'Unknown';
      let why = 'No rider assigned yet.';
      if (d.rider && riderStale) {
        against = 'Unknown';
        why = d.rider.lastLocationAt
          ? `Rider phone stopped reporting ${Math.round((now - d.rider.lastLocationAt.getTime()) / 60000)} min ago`
          : 'Rider has never reported a position';
      } else if (d.promisedAt) {
        const lateMin = Math.round((now - d.promisedAt.getTime()) / 60000);
        against = lateMin > 0 ? 'Late' : 'On time';
        why =
          lateMin > 0
            ? `${lateMin} min past the promised time`
            : `${-lateMin} min before the promised time`;
      } else {
        why = 'No promised time recorded for this delivery.';
      }
      return {
        i: d.id,
        cells: {
          id: this.code(d.order.orderNo),
          cust: d.order.customer?.name ?? 'Walk-in customer',
          rider: d.rider?.name ?? 'Not assigned',
          against,
          told,
          why,
        },
      };
    });
    return {
      kpis: [
        {
          l: 'Being tracked',
          v: String(rows.length),
          sub: 'live right now',
          color: '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'On time',
          v: String(rows.filter((r) => r.cells.against === 'On time').length),
          sub: 'inside the promised window',
          color: '#12A150',
          bd: '#BFE7CF',
        },
        {
          l: 'Late',
          v: String(rows.filter((r) => r.cells.against === 'Late').length),
          sub: `${rows.filter((r) => (r.cells.against === 'Late' && r.cells.told === 'Not told yet') || r.cells.told === 'Message failed to send').length} customer(s) not yet told`,
          color: '#B42318',
          bd: '#FDD9D6',
        },
        {
          l: 'ETA unknown',
          v: String(rows.filter((r) => r.cells.against === 'Unknown').length),
          sub: 'rider signal lost',
          color: '#B54708',
          bd: '#E6EAF0',
        },
      ],
      rows,
    };
  }

  async pod(businessId: string) {
    const startOfDay = await this.startOfDay(businessId);
    const deliveredToday = await this.tenantPrisma.client.delivery.findMany({
      where: {
        businessId,
        status: DeliveryStatus.delivered,
        deliveredAt: { gte: startOfDay },
      },
      include: { order: { include: { customer: true } }, rider: true },
      orderBy: { deliveredAt: 'desc' },
    });
    const rows = deliveredToday.map((d) => {
      const proof = d.proofSignatureKey
        ? 'Signature'
        : d.proofPhotoKey
          ? 'Photo at door'
          : 'None recorded';
      return {
        i: d.id,
        cells: {
          id: this.code(d.order.orderNo),
          cust: d.order.customer?.name ?? 'Walk-in customer',
          proof,
          rider: d.rider?.name ?? 'Not assigned',
          time:
            d.deliveredAt?.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            }) ?? '—',
          status: proof === 'None recorded' ? 'Missing' : 'Captured',
        },
      };
    });
    const captured = rows.filter((r) => r.cells.status === 'Captured').length;
    return {
      kpis: [
        {
          l: 'Captured today',
          v: String(captured),
          sub: `of ${rows.length} delivered`,
          color: '#12A150',
          bd: '#BFE7CF',
        },
        {
          l: 'Missing',
          v: String(rows.length - captured),
          sub: 'worth chasing',
          color: '#B42318',
          bd: '#FDD9D6',
        },
        {
          l: 'Signatures',
          v: String(rows.filter((r) => r.cells.proof === 'Signature').length),
          sub: 'captured today',
          color: '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'Photos',
          v: String(
            rows.filter((r) => r.cells.proof === 'Photo at door').length,
          ),
          sub: 'captured today',
          color: '#0F172A',
          bd: '#E6EAF0',
        },
      ],
      rows,
    };
  }

  /** Delivery has no dedicated fee/cost columns anywhere in the schema — fees taken and cost per delivery are disclosed as not tracked rather than estimated. */
  async analytics(businessId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const delivered = await this.tenantPrisma.client.delivery.findMany({
      where: {
        businessId,
        status: DeliveryStatus.delivered,
        deliveredAt: { gte: since },
      },
    });
    const onTime = delivered.filter(
      (d) => d.promisedAt && d.deliveredAt && d.deliveredAt <= d.promisedAt,
    ).length;
    const withPromise = delivered.filter((d) => d.promisedAt).length;

    const waitingForRider = avg(
      delivered
        .filter((d) => d.assignedAt)
        .map((d) => (d.assignedAt!.getTime() - d.createdAt.getTime()) / 60000),
    );
    const atBranch = avg(
      delivered
        .filter((d) => d.assignedAt && d.pickedUpAt)
        .map(
          (d) => (d.pickedUpAt!.getTime() - d.assignedAt!.getTime()) / 60000,
        ),
    );
    const onTheRoad = avg(
      delivered
        .filter((d) => (d.enRouteAt || d.pickedUpAt) && d.deliveredAt)
        .map(
          (d) =>
            (d.deliveredAt!.getTime() -
              (d.enRouteAt ?? d.pickedUpAt)!.getTime()) /
            60000,
        ),
    );

    const feeRows = delivered.filter((d) => d.deliveryFee !== null);
    const costRows = delivered.filter((d) => d.deliveryCost !== null);
    const feesTotal = feeRows.reduce(
      (sum, d) => sum + Number(d.deliveryFee),
      0,
    );
    const costTotal = costRows.reduce(
      (sum, d) => sum + Number(d.deliveryCost),
      0,
    );
    const both = delivered.filter(
      (d) => d.deliveryFee !== null && d.deliveryCost !== null,
    );
    const net =
      both.length > 0
        ? both.reduce(
            (sum, d) => sum + Number(d.deliveryFee) - Number(d.deliveryCost),
            0,
          )
        : null;
    const fmt = (m: number | null) =>
      m !== null ? `${Math.round(m)} min` : 'Not enough data';

    return {
      kpis: [
        {
          l: 'Delivered (30 days)',
          v: String(delivered.length),
          sub: 'real count, no estimate',
          color: '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'Arrived on time',
          v:
            withPromise > 0
              ? `${round2((onTime / withPromise) * 100)}%`
              : 'Not enough data',
          sub:
            withPromise > 0
              ? `of ${withPromise} with a real promise`
              : 'no delivery with a promise yet',
          color: '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'Cost per delivery',
          v:
            costRows.length > 0
              ? money(costTotal / costRows.length)
              : 'Not configured',
          sub:
            costRows.length > 0
              ? 'from your fuel and rider-pay settings'
              : 'set a dispatch hub and cost model in Settings',
          color: costRows.length > 0 ? '#0F172A' : '#98A2B3',
          bd: '#E6EAF0',
        },
        {
          l: 'Fees taken',
          v: feeRows.length > 0 ? money(feesTotal) : 'None quoted yet',
          sub:
            feeRows.length > 0
              ? `from ${feeRows.length} deliveries with a zone fee`
              : 'give deliveries a zone with a fee',
          color:
            feeRows.length > 0
              ? net !== null && net < 0
                ? '#B42318'
                : '#0F172A'
              : '#98A2B3',
          bd: net !== null && net < 0 ? '#FDD9D6' : '#E6EAF0',
        },
      ],
      stageBreakdown: [
        {
          t: 'Waiting for a rider',
          d: 'From the delivery being created to a rider being assigned.',
          v: fmt(waitingForRider),
          vColor: '#B54708',
        },
        {
          t: 'At the branch',
          d: 'From assigned to picked up.',
          v: fmt(atBranch),
          vColor: '#475467',
        },
        {
          t: 'On the road',
          d: 'From leaving to arriving.',
          v: fmt(onTheRoad),
          vColor: '#475467',
        },
        {
          t: 'At the door',
          d: 'Not tracked: the moment a rider arrives is not recorded, only the moment it is marked delivered.',
          v: 'Not tracked',
          vColor: '#98A2B3',
        },
      ],
      panels:
        net !== null
          ? [
              {
                h:
                  net < 0
                    ? 'Delivery does not pay for itself'
                    : 'Delivery pays for itself',
                sub: `Across ${both.length} deliveries that have both a fee and a cost`,
                bd: net < 0 ? '#FDD9D6' : '#BFE7CF',
                items: [
                  {
                    t: `${net < 0 ? `${money(-net)} short` : `${money(net)} ahead`} in the last 30 days`,
                    tag: 'Calculated',
                    tagBg: '#EEF4FF',
                    tagFg: '#3538CD',
                    d: `Fees of ${money(both.reduce((a, d) => a + Number(d.deliveryFee), 0))} against ${money(both.reduce((a, d) => a + Number(d.deliveryCost), 0))} of fuel and rider pay, from the cost model in your settings.`,
                  },
                ],
              },
            ]
          : [],
      note:
        feeRows.length === 0 || costRows.length === 0
          ? 'Profitability appears once deliveries have both a zone fee and a cost: give deliveries a zone with a fee, set the dispatch hub, and enter your fuel and rider-pay costs in Settings.'
          : '',
    };
  }

  async rider360(businessId: string, riderId: string) {
    const rider = await this.tenantPrisma.client.rider.findFirst({
      where: { id: riderId, businessId },
    });
    if (!rider) throw new NotFoundException('Rider not found');

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const tz =
      (
        await this.tenantPrisma.client.business.findUnique({
          where: { id: businessId },
          select: { timezone: true },
        })
      )?.timezone ?? 'UTC';
    const [thisMonth, cashPayments] = await Promise.all([
      this.tenantPrisma.client.delivery.findMany({
        where: { riderId, createdAt: { gte: since } },
      }),
      this.tenantPrisma.client.payment.findMany({
        where: {
          method: 'cash',
          createdAt: { gte: since },
          order: { delivery: { riderId } },
        },
        select: { amount: true },
      }),
    ]);
    const delivered = thisMonth.filter((d) => d.status === 'delivered');
    const failed = thisMonth.filter((d) => d.status === 'failed');
    const withPromise = delivered.filter((d) => d.promisedAt);
    const onTime = withPromise.filter(
      (d) => d.promisedAt && d.deliveredAt && d.deliveredAt <= d.promisedAt,
    ).length;

    const doorToDoor = avg(
      delivered
        .filter((d) => d.assignedAt && d.deliveredAt)
        .map(
          (d) => (d.deliveredAt!.getTime() - d.assignedAt!.getTime()) / 60000,
        ),
    );
    const hourCounts = new Map<number, number>();
    for (const d of delivered.filter((d) => d.deliveredAt)) {
      const hour =
        Number(
          new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            hour12: false,
            timeZone: tz,
          }).format(d.deliveredAt!),
        ) % 24;
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }
    const busiestHour = [...hourCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];
    const byDay = new Map<string, number>();
    for (const d of delivered.filter((d) => d.deliveredAt)) {
      const key = d.deliveredAt!.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const stopsPerShift = avg([...byDay.values()]);

    const totalCash = round2(
      cashPayments.reduce((s, p) => s + Number(p.amount), 0),
    );
    const held = await this.riders.cashHeld(riderId);

    return {
      kpis: [
        {
          l: 'Deliveries (30 days)',
          v: String(thisMonth.length),
          sub: rider.name,
          color: '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'Arrived on time',
          v:
            withPromise.length > 0
              ? `${round2((onTime / withPromise.length) * 100)}%`
              : 'Not enough data',
          sub:
            withPromise.length > 0
              ? `of ${withPromise.length} with a real promise`
              : 'no promise recorded yet',
          color: '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'Failed',
          v: String(failed.length),
          sub:
            thisMonth.length > 0
              ? `${round2((failed.length / thisMonth.length) * 100)}% of their deliveries`
              : 'no deliveries yet',
          color: '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'Cash handled (30 days)',
          v: money(totalCash),
          sub: 'from cash-on-delivery payments',
          color: '#12A150',
          bd: '#BFE7CF',
        },
      ],
      panels: [
        {
          h: rider.name,
          sub: `${rider.vehicleType ?? 'Vehicle not set'} · joined ${rider.createdAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
          bd: '#E6EAF0',
          items: [
            {
              t: 'Average door-to-door',
              d: `From assigned to delivered, across ${delivered.length} deliveries in the last 30 days.`,
              v:
                doorToDoor !== null
                  ? `${Math.round(doorToDoor)} min`
                  : 'Not enough data',
              vColor: '#101828',
            },
            {
              t: 'Busiest hour',
              d: 'When most of their deliveries land, in the last 30 days.',
              v:
                busiestHour !== undefined
                  ? `${busiestHour}:00–${busiestHour + 1}:00`
                  : 'Not enough data',
              vColor: '#101828',
            },
            {
              t: 'Stops per active day',
              d: 'Averaged over the last 30 days.',
              v:
                stopsPerShift !== null
                  ? String(stopsPerShift)
                  : 'Not enough data',
              vColor: '#101828',
            },
          ],
        },
        {
          h: 'Cash handling',
          bd: '#BFE7CF',
          items: [
            {
              t: 'Collected in the last 30 days',
              d: `${money(totalCash)} in cash-on-delivery payments.`,
            },
            {
              t: 'Currently carrying',
              d: 'Collected but not yet handed in at the branch.',
              v: money(held),
              vColor: held > 0 ? '#B42318' : '#12A150',
            },
          ],
        },
      ],
    };
  }

  async routesSummary(businessId: string) {
    const startOfDay = await this.startOfDay(businessId);
    const routes = await this.tenantPrisma.client.route.findMany({
      where: { businessId, createdAt: { gte: startOfDay } },
      include: {
        rider: true,
        deliveries: {
          orderBy: { routeSequence: 'asc' },
          include: { order: { include: { customer: true } } },
        },
      },
    });
    let totalKm = 0;
    let plannedStops = 0;
    let doneStops = 0;
    const panels = routes.map((r) => {
      const withCoords = r.deliveries.filter(
        (d) => d.lat !== null && d.lng !== null,
      );
      let km = 0;
      for (let i = 1; i < withCoords.length; i++) {
        km += this.routing.haversineKm(
          {
            lat: Number(withCoords[i - 1].lat),
            lng: Number(withCoords[i - 1].lng),
          },
          { lat: Number(withCoords[i].lat), lng: Number(withCoords[i].lng) },
        );
      }
      totalKm += km;
      plannedStops += r.deliveries.length;
      const done = r.deliveries.filter(
        (d) => d.status === 'delivered' || d.status === 'failed',
      ).length;
      doneStops += done;
      const remaining = r.deliveries.filter(
        (d) => d.status !== 'delivered' && d.status !== 'failed',
      );
      return {
        routeId: r.id,
        h: `${r.rider?.name ?? 'Unassigned'} · ${remaining.length} stops left`,
        sub: `${r.deliveries.length} planned, ${round2(km)} km`,
        bd: '#E6EAF0',
        items: remaining.slice(0, 4).map((d, i) => ({
          t: `${i + 1} · ${d.order.customer?.name ?? 'Walk-in customer'}, ${d.addressLine}`,
          v: d.promisedAt
            ? d.promisedAt.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })
            : 'No promise set',
          vColor:
            d.promisedAt && d.promisedAt.getTime() < Date.now()
              ? '#B42318'
              : '#475467',
        })),
      };
    });
    return {
      kpis: [
        {
          l: 'Routes today',
          v: String(routes.length),
          sub: 'built today',
          color: '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'Stops planned',
          v: String(plannedStops),
          sub: `${plannedStops - doneStops} still to do`,
          color: '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'Distance planned',
          v: `${round2(totalKm)} km`,
          sub: 'straight-line between stops',
          color: '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'Riders with a route',
          v: String(routes.filter((r) => r.riderId).length),
          sub: 'today',
          color: '#0F172A',
          bd: '#E6EAF0',
        },
      ],
      panels,
    };
  }

  /**
   * Zones — every money figure is computed from the fee and cost snapshots stored on each
   * delivery in the last 30 days (zone charge rule + the owner's cost model). A figure is only
   * shown when its inputs exist: no hub means no distance, no cost model means no cost.
   */
  async zonesSummary(businessId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const [settings, zones, deliveries] = await Promise.all([
      this.deliverySettings.get(businessId),
      this.tenantPrisma.client.deliveryZone.findMany({
        where: { businessId },
        orderBy: { name: 'asc' },
      }),
      this.tenantPrisma.client.delivery.findMany({
        where: { businessId, createdAt: { gte: since } },
        select: {
          zoneId: true,
          deliveryFee: true,
          deliveryCost: true,
          distanceKm: true,
        },
      }),
    ]);
    const hubSet = settings.hubLat !== null && settings.hubLng !== null;
    const active = zones.filter((z) => z.active).length;

    const stats = zones.map((z) => {
      const rows = deliveries.filter((d) => d.zoneId === z.id);
      const feeRows = rows.filter((d) => d.deliveryFee !== null);
      const both = rows.filter(
        (d) => d.deliveryFee !== null && d.deliveryCost !== null,
      );
      const avgFee = avg(feeRows.map((d) => Number(d.deliveryFee)));
      const avgCost = avg(both.map((d) => Number(d.deliveryCost)));
      const netTotal =
        both.length > 0
          ? round2(
              both.reduce(
                (a, d) => a + Number(d.deliveryFee) - Number(d.deliveryCost),
                0,
              ),
            )
          : null;
      const netPer = netTotal !== null ? round2(netTotal / both.length) : null;
      return { z, count: rows.length, avgFee, avgCost, netPer, netTotal };
    });

    const distances = deliveries
      .filter((d) => d.distanceKm !== null)
      .map((d) => Number(d.distanceKm));
    const allFees = deliveries
      .filter((d) => d.deliveryFee !== null)
      .map((d) => Number(d.deliveryFee));
    const losing = stats.filter((s) => s.netPer !== null && s.netPer < 0);
    const anyNet = stats.some((s) => s.netPer !== null);

    const rule = (z: (typeof zones)[number]) =>
      z.chargeType === 'flat'
        ? `${money(Number(z.flatAmount ?? 0))} flat fee`
        : z.chargeType === 'by_distance'
          ? `${money(Number(z.perKmAmount ?? 0))} per km`
          : `${money(Number(z.flatAmount ?? 0))} fee by order value`;

    return {
      hub: hubSet
        ? { lat: Number(settings.hubLat), lng: Number(settings.hubLng) }
        : null,
      kpis: [
        {
          l: 'Zones',
          v: String(zones.length),
          sub: `${active} delivering, ${zones.length - active} paused`,
          color: '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'Furthest you deliver',
          v:
            distances.length > 0
              ? `${round2(Math.max(...distances))} km`
              : hubSet
                ? 'No data yet'
                : 'Set a hub',
          sub: hubSet
            ? 'from your dispatch hub, last 30 days'
            : 'enter the dispatch hub location in Settings',
          color: distances.length > 0 ? '#0F172A' : '#98A2B3',
          bd: '#E6EAF0',
        },
        {
          l: 'Average fee',
          v: allFees.length > 0 ? money(avg(allFees) ?? 0) : 'None quoted yet',
          sub:
            allFees.length > 0
              ? `across ${allFees.length} deliveries`
              : 'deliveries need a zone with a fee',
          color: allFees.length > 0 ? '#0F172A' : '#98A2B3',
          bd: '#E6EAF0',
        },
        {
          l: 'Zones losing money',
          v: anyNet ? String(losing.length) : 'No data yet',
          sub:
            losing.length > 0
              ? losing.map((s) => s.z.name).join(', ')
              : anyNet
                ? 'every zone covers its cost'
                : 'needs fees and a cost model',
          color: losing.length > 0 ? '#B42318' : anyNet ? '#0F172A' : '#98A2B3',
          bd: losing.length > 0 ? '#FDD9D6' : '#E6EAF0',
        },
      ],
      zones: stats.map((s) => ({
        t: s.z.name,
        d: `${rule(s.z)}${s.z.slaMinutes ? ` · ${s.z.slaMinutes} min SLA` : ''}. ${s.count} deliveries in 30 days${s.avgFee !== null ? `, average fee ${money(s.avgFee)}` : ''}${s.avgCost !== null ? `, average cost ${money(s.avgCost)}` : ''}.`,
        v:
          s.netPer !== null
            ? `${s.netPer >= 0 ? '+' : '-'}${money(Math.abs(s.netPer))} each`
            : s.z.active
              ? 'Delivering'
              : 'Paused',
        vColor:
          s.netPer !== null
            ? s.netPer >= 0
              ? '#0E8442'
              : '#B42318'
            : s.z.active
              ? '#0E8442'
              : '#B42318',
      })),
      lossPanel:
        losing.length > 0
          ? {
              h: `${losing.map((s) => s.z.name).join(', ')} ${losing.length === 1 ? 'is' : 'are'} costing you`,
              sub: 'Based on each delivery fee and cost in the last 30 days',
              bd: '#FDD9D6',
              items: losing.map((s) => ({
                t: `${s.z.name}: ${money(Math.abs(s.netTotal ?? 0))} lost in 30 days`,
                tag: 'Calculated',
                tagBg: '#EEF4FF',
                tagFg: '#3538CD',
                d: `${money(Math.abs(s.netPer ?? 0))} under cost on each delivery. Raising the fee or setting a minimum order value are both your call, and neither happens automatically.`,
              })),
            }
          : null,
      rules: [
        {
          key: 'enforceZoneCoverage',
          t: 'Nothing outside a zone can be ordered',
          d: 'Online delivery orders must choose one of your zones; anything else is refused instead of being quoted a time you cannot keep.',
          on: settings.enforceZoneCoverage,
        },
        {
          key: 'showFeeBeforeCheckout',
          t: 'Fee shown before checkout',
          d: 'The public menu lists each zone fee so a customer sees it before ordering.',
          on: settings.showFeeBeforeCheckout,
        },
        {
          key: 'pausedZonesBlockOrders',
          t: 'Paused zones stop taking orders immediately',
          d: 'An online delivery order for a paused zone is refused the moment you pause it.',
          on: settings.pausedZonesBlockOrders,
        },
      ],
    };
  }

  /**
   * Automations — a real rule engine: each rule's switch is a stored setting, and the counts are
   * rows in the automation run log, written only when a rule actually acted.
   */
  async automationsSummary(businessId: string) {
    const [settings, runs, activeRiders, failed] = await Promise.all([
      this.deliverySettings.get(businessId),
      this.automations.runSummary(businessId),
      this.tenantPrisma.client.rider.findMany({
        where: { businessId, status: 'active' },
      }),
      this.tenantPrisma.client.delivery.findMany({
        where: { businessId, status: 'failed' },
        select: { orderId: true },
      }),
    ]);
    const enriched = await this.riders.enrich(activeRiders);
    const staleNow = enriched.filter(
      (r) => r.stale && r.displayStatus !== 'On break',
    );
    const overCash =
      settings.cashLimitAmount !== null
        ? enriched.filter((r) => r.cashHeld > Number(settings.cashLimitAmount))
        : [];
    const overloaded = enriched.filter(
      (r) => r.activeDeliveries >= settings.warnAtStopCount,
    );
    const resolved =
      failed.length > 0
        ? await this.tenantPrisma.client.return.count({
            where: {
              orderId: { in: failed.map((f) => f.orderId) },
              status: 'approved',
            },
          })
        : 0;
    const openFailures = failed.length - resolved;

    const flags = settings as unknown as Record<string, unknown>;
    const runInfo = (rule: string) => {
      const r = runs.get(rule);
      return r
        ? `Ran ${r.count} ${r.count === 1 ? 'time' : 'times'} today, last: ${r.last}.`
        : 'Has not run today.';
    };
    const rules = [
      {
        key: 'autoEtaOnAssign',
        rule: 'eta_on_assign',
        t: 'Send an ETA when a rider is assigned',
        extra: '',
      },
      {
        key: 'autoEtaOnSlip',
        rule: 'eta_on_slip',
        t: `Tell the customer if the ETA slips past ${settings.slipThresholdMinutes} minutes`,
        extra: '',
      },
      {
        key: 'autoFlagStalePhone',
        rule: 'flag_stale_phone',
        t: `Flag a rider who has not reported for ${settings.staleLocationMinutes} minutes`,
        extra:
          staleNow.length > 0
            ? ` Right now: ${staleNow.map((r) => r.name).join(', ')}.`
            : '',
      },
      {
        key: 'autoWarnCashLimit',
        rule: 'warn_cash_limit',
        t: 'Warn when a rider passes the cash limit',
        extra:
          settings.cashLimitAmount === null
            ? ' No cash limit is set in Settings, so this cannot trigger yet.'
            : overCash.length > 0
              ? ` Right now: ${overCash.map((r) => r.name).join(', ')}.`
              : '',
      },
      {
        key: 'autoTaskOnFailure',
        rule: 'task_on_failure',
        t: 'Alert the owner and managers when a delivery fails',
        extra: '',
      },
    ];
    const on = rules.filter((r) => flags[r.key] === true).length;
    const ranToday = [...runs.values()].reduce((a, r) => a + r.count, 0);

    return {
      kpis: [
        {
          l: 'Active rules',
          v: String(on),
          sub: `of ${rules.length} available`,
          color: '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'Ran today',
          v: String(ranToday),
          sub: ranToday > 0 ? 'each one logged' : 'nothing has triggered yet',
          color: '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'Waiting on you',
          v: String(openFailures + overloaded.length),
          sub: `${openFailures} failed, ${overloaded.length} overloaded`,
          color: openFailures + overloaded.length > 0 ? '#B54708' : '#0F172A',
          bd: '#E6EAF0',
        },
        {
          l: 'Never automatic',
          v: '4',
          sub: 'always ask first',
          color: '#12A150',
          bd: '#BFE7CF',
        },
      ],
      panels: [
        {
          h: 'Runs on its own',
          sub: 'Messages and alerts only. Switch each one on or off.',
          bd: '#BFE7CF',
          items: rules.map((r) => ({
            t: r.t,
            d: `${runInfo(r.rule)}${r.extra}`,
            toggle: true,
            toggleOn: flags[r.key] === true,
            settingKey: r.key,
          })),
        },
        {
          h: 'Always asks first',
          sub: 'These change what a rider or a customer is doing. No code path does them automatically.',
          bd: '#FDE3B3',
          items: [
            {
              t: 'Move stops off an overloaded rider',
              tag: 'Needs approval',
              tagBg: '#FEF6E7',
              tagFg: '#B54708',
              d:
                overloaded.length > 0
                  ? `${overloaded.length} rider(s) over the stop warning now. Reassigning changes a rider's afternoon and the ETA a customer was given.`
                  : 'Nobody is over the stop warning right now.',
            },
            {
              t: 'Retry a failed delivery',
              tag: 'Needs approval',
              tagBg: '#FEF6E7',
              tagFg: '#B54708',
              d: 'Sending a rider back costs time and fuel, and the customer may no longer want the order.',
            },
            {
              t: 'Pause a zone when nobody is free',
              tag: 'Off',
              tagBg: '#F2F4F7',
              tagFg: '#475467',
              d: 'Would stop customers ordering. Too blunt to run unattended.',
            },
            {
              t: 'Refund a failed delivery',
              tag: 'Never automatic',
              tagBg: '#FEF3F2',
              tagFg: '#B42318',
              d: 'Money never moves without a person deciding.',
            },
          ],
        },
      ],
    };
  }
}
