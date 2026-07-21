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
}
