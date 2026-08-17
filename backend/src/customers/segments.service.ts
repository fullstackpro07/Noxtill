import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { Prisma } from '../../generated/prisma';

const NEW_CUSTOMER_WINDOW_DAYS = 30;

/** Customer segments (BE-041): vip/new/lapsed are computed tags/windows; any other key is treated as a custom tag. */
@Injectable()
export class SegmentsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getSegment(key: string) {
    const where = this.whereForKey(key);
    const members = await this.tenantPrisma.client.customer.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return { key, count: members.length, members };
  }

  // MySQL migration: `tags` is a JSON array now (Prisma's MySQL connector has no native array
  // column type), so every tag-membership check uses the Json filter API's `array_contains`
  // instead of the old scalar-list `has` operator.
  private whereForKey(key: string): Prisma.CustomerWhereInput {
    switch (key) {
      case 'all':
        return {};
      case 'vip':
        return { tags: { array_contains: ['VIP'] } };
      case 'lapsed':
        return { tags: { array_contains: ['Lapsed'] } };
      case 'new': {
        const since = new Date(
          Date.now() - NEW_CUSTOMER_WINDOW_DAYS * 24 * 60 * 60 * 1000,
        );
        return { createdAt: { gte: since } };
      }
      default:
        return { tags: { array_contains: [key] } };
    }
  }
}
