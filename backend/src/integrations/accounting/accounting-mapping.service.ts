import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { UpsertAccountingMappingDto } from './dto/upsert-accounting-mapping.dto';
import { ACCOUNTING_PROVIDERS } from './accounting.constants';
import { IntegrationProvider } from '@prisma/client';

/**
 * Accounting Sync's account/tax-code mapping (UPD-BE-072) — a NULL `productCategory` row is the
 * catch-all default; a non-NULL row overrides it for that one product category. `AccountingSyncService`
 * resolves each order line against these before ever pushing an invoice.
 */
@Injectable()
export class AccountingMappingService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(provider?: IntegrationProvider) {
    return this.tenantPrisma.client.accountingMapping.findMany({
      where: {
        provider: provider ?? { in: ACCOUNTING_PROVIDERS },
      },
      orderBy: [{ provider: 'asc' }, { productCategory: 'asc' }],
    });
  }

  /**
   * Not a Prisma `upsert()`: its compound-unique `where` input requires `productCategory: string`,
   * non-nullable, even though the column itself is nullable (MySQL doesn't enforce uniqueness
   * across NULLs anyway, which is exactly why Prisma won't type-check a null into that shape) — a
   * real find-then-write is what correctly supports NULL as "the default mapping" here.
   */
  async upsert(businessId: string, dto: UpsertAccountingMappingDto) {
    const productCategory = dto.productCategory ?? null;
    const existing = await this.tenantPrisma.client.accountingMapping.findFirst(
      {
        where: { businessId, provider: dto.provider, productCategory },
      },
    );

    if (existing) {
      return this.tenantPrisma.client.accountingMapping.update({
        where: { id: existing.id },
        data: {
          externalAccountCode: dto.externalAccountCode,
          externalTaxCode: dto.externalTaxCode,
        },
      });
    }
    return this.tenantPrisma.client.accountingMapping.create({
      data: {
        businessId,
        provider: dto.provider,
        productCategory,
        externalAccountCode: dto.externalAccountCode,
        externalTaxCode: dto.externalTaxCode,
      },
    });
  }

  async remove(id: string) {
    const existing =
      await this.tenantPrisma.client.accountingMapping.findUnique({
        where: { id },
      });
    if (!existing) throw new NotFoundException('Accounting mapping not found');
    await this.tenantPrisma.client.accountingMapping.delete({ where: { id } });
    return { success: true };
  }
}
