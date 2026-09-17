import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateCustomerCustomFieldDto } from './dto/create-customer-custom-field.dto';

/**
 * Customer Settings — Custom fields (UPD-BE-101). Definitions live here; the actual per-customer
 * value lives in `Customer.customFieldValues` (a JSON bag keyed by field name), set via
 * `PATCH /customers/:id`. "Used by N customers" is computed in JS rather than a raw JSON-path SQL
 * query — MySQL's `JSON_CONTAINS_PATH` needs a hand-built path string per field name, which is
 * more fragile than just reducing over the (typically small) real customer list.
 */
@Injectable()
export class CustomerCustomFieldsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(businessId: string) {
    const [fields, customers] = await Promise.all([
      this.tenantPrisma.client.customerCustomField.findMany({
        where: { businessId },
        orderBy: { createdAt: 'asc' },
      }),
      this.tenantPrisma.client.customer.findMany({
        where: { businessId },
        select: { customFieldValues: true },
      }),
    ]);

    return fields.map((field) => {
      const used = customers.filter((c) => {
        const values = c.customFieldValues as Record<string, unknown> | null;
        return (
          values != null &&
          Object.prototype.hasOwnProperty.call(values, field.name) &&
          values[field.name] !== null &&
          values[field.name] !== ''
        );
      }).length;
      return { ...field, usedCount: used };
    });
  }

  create(businessId: string, dto: CreateCustomerCustomFieldDto) {
    return this.tenantPrisma.client.customerCustomField.create({
      data: {
        businessId,
        name: dto.name,
        type: dto.type,
        options: dto.options ?? [],
      },
    });
  }

  async remove(businessId: string, id: string) {
    const field = await this.tenantPrisma.client.customerCustomField.findUnique({ where: { id } });
    if (!field || field.businessId !== businessId) {
      throw new NotFoundException('Custom field not found');
    }
    await this.tenantPrisma.client.customerCustomField.delete({ where: { id } });
  }
}
