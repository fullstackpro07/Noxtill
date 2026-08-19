import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ACTIVE_DELIVERY_STATUSES } from './delivery.constants';

/**
 * Auto-assign (UPD-BE-065) — real load-balancing rule: among `active`-status riders, pick
 * whoever currently has the fewest deliveries in an active state (`assigned`/`picked_up`/
 * `en_route`). Returns null (delivery stays `unassigned`) rather than throwing when no rider is
 * available — a delivery with nobody to assign yet is a normal, expected state, not an error.
 */
@Injectable()
export class DeliveryAssignmentService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async pickRider(): Promise<string | null> {
    const activeRiders = await this.tenantPrisma.client.rider.findMany({
      where: { status: 'active' },
    });
    if (activeRiders.length === 0) return null;

    const loadCounts = await this.tenantPrisma.client.delivery.groupBy({
      by: ['riderId'],
      where: {
        riderId: { in: activeRiders.map((r) => r.id) },
        status: { in: [...ACTIVE_DELIVERY_STATUSES] },
      },
      _count: { riderId: true },
    });
    const loadByRiderId = new Map(
      loadCounts.map((row) => [row.riderId, row._count.riderId]),
    );

    let bestRider = activeRiders[0];
    let bestLoad = loadByRiderId.get(bestRider.id) ?? 0;
    for (const rider of activeRiders.slice(1)) {
      const load = loadByRiderId.get(rider.id) ?? 0;
      if (load < bestLoad) {
        bestRider = rider;
        bestLoad = load;
      }
    }
    return bestRider.id;
  }
}
