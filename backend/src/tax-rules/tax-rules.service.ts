import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateTaxRuleDto } from './dto/create-tax-rule.dto';
import { UpdateTaxRuleDto } from './dto/update-tax-rule.dto';

/**
 * Taxes & Currency, multi-rate (UPD-BE-120) — real CRUD over `TaxRule`. Additive on top of the
 * existing `Business.taxRate`/`.taxLabel` flat default (unchanged by this module): order pricing
 * (`order-totals.util.ts`'s `resolveTaxRatePercent`) checks these rules by product category first,
 * falling back to the flat rate when none match. Category is free text here to match `Product.category`,
 * the field every order-creation path already reads.
 */
@Injectable()
export class TaxRulesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(businessId: string) {
    return this.tenantPrisma.client.taxRule.findMany({
      where: { businessId },
      orderBy: [{ category: 'asc' }],
    });
  }

  create(businessId: string, dto: CreateTaxRuleDto) {
    return this.tenantPrisma.client.taxRule.create({
      data: {
        businessId,
        category: dto.category ?? null,
        label: dto.label,
        rate: dto.rate,
        taxInclusive: dto.taxInclusive ?? false,
        active: dto.active ?? true,
      },
    });
  }

  async update(businessId: string, id: string, dto: UpdateTaxRuleDto) {
    await this.assertOwned(businessId, id);
    return this.tenantPrisma.client.taxRule.update({
      where: { id },
      data: {
        category:
          dto.category !== undefined ? (dto.category ?? null) : undefined,
        label: dto.label,
        rate: dto.rate,
        taxInclusive: dto.taxInclusive,
        active: dto.active,
      },
    });
  }

  async remove(businessId: string, id: string) {
    await this.assertOwned(businessId, id);
    await this.tenantPrisma.client.taxRule.delete({ where: { id } });
  }

  private async assertOwned(businessId: string, id: string): Promise<void> {
    const rule = await this.tenantPrisma.client.taxRule.findUnique({
      where: { id },
    });
    if (!rule || rule.businessId !== businessId) {
      throw new AppException(
        'TAX_RULE_NOT_FOUND',
        `Tax rule ${id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
