import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async listByCustomer(customerId: string) {
    return this.tenantPrisma.client.message.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Customers Activity feed — every real message across the business, not just one customer's. */
  async listRecent(limit: number) {
    return this.tenantPrisma.client.message.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });
  }
}
