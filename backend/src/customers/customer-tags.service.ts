import { ConflictException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateCustomerTagDto } from './dto/create-customer-tag.dto';

/**
 * Customer Settings — Tags catalog (UPD-BE-101). Usage count is always computed live via
 * `customer.count({ where: { tags: { array_contains: [name] } } })`, the same idiom
 * `SegmentsService.list()` already uses for its own live counts — never a denormalized counter.
 */
@Injectable()
export class CustomerTagsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(businessId: string) {
    const tags = await this.tenantPrisma.client.customerTag.findMany({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      tags.map(async (tag) => ({
        ...tag,
        count: await this.tenantPrisma.client.customer.count({
          where: { businessId, tags: { array_contains: [tag.name] } },
        }),
      })),
    );
  }

  async create(businessId: string, dto: CreateCustomerTagDto) {
    const existing = await this.tenantPrisma.client.customerTag.findUnique({
      where: { businessId_name: { businessId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException(`Tag "${dto.name}" already exists`);
    }
    return this.tenantPrisma.client.customerTag.create({
      data: { businessId, name: dto.name, kind: 'manual' },
    });
  }

  /** Called from `CustomersService.create`/`update` whenever a new free-text tag string is used,
   * so the catalog is always complete without requiring a separate manual registration step. */
  async ensureExists(businessId: string, name: string): Promise<void> {
    await this.tenantPrisma.client.customerTag.upsert({
      where: { businessId_name: { businessId, name } },
      create: { businessId, name, kind: 'manual' },
      update: {},
    });
  }
}
