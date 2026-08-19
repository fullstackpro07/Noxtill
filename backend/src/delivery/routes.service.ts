import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { RoutingService, RouteStop } from './routing.service';
import { CreateRouteDto } from './dto/create-route.dto';

/** Multi-stop route builder + nearest-neighbour optimisation (UPD-BE-066). */
@Injectable()
export class RoutesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly routing: RoutingService,
  ) {}

  list() {
    return this.tenantPrisma.client.route.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        rider: true,
        deliveries: { orderBy: { routeSequence: 'asc' } },
      },
    });
  }

  async findOne(id: string) {
    const route = await this.tenantPrisma.client.route.findUnique({
      where: { id },
      include: {
        rider: true,
        deliveries: { orderBy: { routeSequence: 'asc' } },
      },
    });
    if (!route) throw new NotFoundException('Route not found');
    return route;
  }

  async create(businessId: string, dto: CreateRouteDto) {
    const route = await this.tenantPrisma.client.route.create({
      data: { businessId, riderId: dto.riderId },
    });

    await this.tenantPrisma.client.$transaction(
      dto.deliveryIds.map((deliveryId, index) =>
        this.tenantPrisma.client.delivery.update({
          where: { id: deliveryId },
          data: { routeId: route.id, routeSequence: index },
        }),
      ),
    );

    return this.findOne(route.id);
  }

  /** Real greedy nearest-neighbour reorder — deliveries without coordinates are left where they are (can't be optimised). */
  async optimise(id: string) {
    const route = await this.findOne(id);
    const optimisable = route.deliveries.filter(
      (d) => d.lat !== null && d.lng !== null,
    );
    if (optimisable.length === 0) return route;

    const rider = route.riderId
      ? await this.tenantPrisma.client.rider.findUnique({
          where: { id: route.riderId },
        })
      : null;
    const hasRealRiderLocation =
      rider?.lastLat != null && rider?.lastLng != null;

    // With a real rider position, every optimisable delivery is a genuine stop to travel to.
    // Without one, there's no real starting point except one of the deliveries themselves — using
    // its own coordinates as the anchor and re-listing it as a stop to travel to (distance 0 from
    // itself) would trivially "win" every time, so it's held out of `stops` and prepended after.
    const anchor = hasRealRiderLocation ? null : optimisable[0];
    const toOrder = anchor ? optimisable.slice(1) : optimisable;

    const origin = hasRealRiderLocation
      ? { lat: Number(rider.lastLat), lng: Number(rider.lastLng) }
      : { lat: Number(anchor!.lat), lng: Number(anchor!.lng) };

    const stops: RouteStop[] = toOrder.map((d) => ({
      deliveryId: d.id,
      lat: Number(d.lat),
      lng: Number(d.lng),
    }));
    const orderedRest = await this.routing.optimiseOrder(origin, stops);
    const ordered = anchor
      ? [
          {
            deliveryId: anchor.id,
            lat: Number(anchor.lat),
            lng: Number(anchor.lng),
          },
          ...orderedRest,
        ]
      : orderedRest;

    await this.tenantPrisma.client.$transaction(
      ordered.map((stop, index) =>
        this.tenantPrisma.client.delivery.update({
          where: { id: stop.deliveryId },
          data: { routeSequence: index },
        }),
      ),
    );

    return this.findOne(id);
  }
}
