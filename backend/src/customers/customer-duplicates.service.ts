import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CustomerMergeSettingsService } from './customer-merge-settings.service';
import { DismissCustomerDuplicateDto } from './dto/dismiss-customer-duplicate.dto';
import { CustomerMatchOn } from '@prisma/client';

interface DuplicateCandidate {
  id: string;
  name: string;
  phone: string;
}

export interface DuplicatePair {
  a: DuplicateCandidate;
  b: DuplicateCandidate;
  reason: string;
}

function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Duplicates screen (UPD-BE-101) — exact-match only, same conservative standard as the import
 * pipeline's own dedup (`customer-import.service.ts`'s normalized-phone match): no fuzzy name
 * matching anywhere. `matchOn` (from `CustomerMergeSettings`) controls which exact fields count as
 * a match; dismissals persist in `CustomerDuplicateDismissal` so "Not a duplicate" survives a
 * refresh, unlike the previous client-only session dismissal.
 */
@Injectable()
export class CustomerDuplicatesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly mergeSettings: CustomerMergeSettingsService,
  ) {}

  async list(businessId: string) {
    const [customers, settings, dismissals] = await Promise.all([
      this.tenantPrisma.client.customer.findMany({
        where: { businessId },
        select: { id: true, name: true, phone: true, email: true },
      }),
      this.mergeSettings.get(businessId),
      this.tenantPrisma.client.customerDuplicateDismissal.findMany({
        where: { businessId },
      }),
    ]);

    const dismissedKeys = new Set(
      dismissals.map((d) => `${d.customerIdLow}:${d.customerIdHigh}`),
    );
    const pairs = this.findPairs(customers, settings.matchOn as CustomerMatchOn);
    return pairs.filter((p) => {
      const [low, high] = sortedPair(p.a.id, p.b.id);
      return !dismissedKeys.has(`${low}:${high}`);
    });
  }

  async dismiss(businessId: string, userId: string, dto: DismissCustomerDuplicateDto) {
    const [customerIdLow, customerIdHigh] = sortedPair(dto.customerIdA, dto.customerIdB);
    return this.tenantPrisma.client.customerDuplicateDismissal.upsert({
      where: {
        businessId_customerIdLow_customerIdHigh: {
          businessId,
          customerIdLow,
          customerIdHigh,
        },
      },
      create: {
        businessId,
        customerIdLow,
        customerIdHigh,
        dismissedByUserId: userId,
      },
      update: {},
    });
  }

  private findPairs(
    customers: { id: string; name: string; phone: string; email: string | null }[],
    matchOn: CustomerMatchOn,
  ): DuplicatePair[] {
    const pairs: DuplicatePair[] = [];
    const toCandidate = (c: { id: string; name: string; phone: string }): DuplicateCandidate => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
    });

    if (matchOn !== 'phone_only') {
      const byEmail = new Map<string, typeof customers>();
      for (const c of customers) {
        const key = c.email?.trim().toLowerCase();
        if (!key) continue;
        byEmail.set(key, [...(byEmail.get(key) ?? []), c]);
      }
      for (const group of byEmail.values()) {
        for (let i = 1; i < group.length; i++) {
          pairs.push({ a: toCandidate(group[0]), b: toCandidate(group[i]), reason: 'Same email address' });
        }
      }
    }

    // Phone is unique per business at the DB level (`@@unique([businessId, phone])`), so this
    // branch is a defensive no-op today — kept so a future relaxation of that constraint (or a
    // pre-constraint historical import) doesn't silently stop being checked.
    const byPhone = new Map<string, typeof customers>();
    for (const c of customers) {
      const key = c.phone.replace(/\D/g, '');
      if (!key) continue;
      byPhone.set(key, [...(byPhone.get(key) ?? []), c]);
    }
    for (const group of byPhone.values()) {
      for (let i = 1; i < group.length; i++) {
        const nameMatches =
          group[0].name.trim().toLowerCase() === group[i].name.trim().toLowerCase();
        if (matchOn === 'name_and_phone' && !nameMatches) continue;
        pairs.push({ a: toCandidate(group[0]), b: toCandidate(group[i]), reason: 'Same phone number' });
      }
    }

    return pairs;
  }
}
