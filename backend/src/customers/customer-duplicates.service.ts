import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CustomerMergeSettingsService } from './customer-merge-settings.service';
import { DismissCustomerDuplicateDto } from './dto/dismiss-customer-duplicate.dto';
import { excludeErasedCustomers } from './segment-rules.util';

interface DuplicateCandidate {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
}

type DuplicateMatchField = 'email' | 'phone';
type ComparedCustomerField = 'name' | 'phone' | 'email' | 'address';

type DuplicateMatchEvidence = {
  field: DuplicateMatchField;
  method: 'trimmed_case_insensitive' | 'digits_only';
  label: string;
};

export interface DuplicatePair {
  a: DuplicateCandidate;
  b: DuplicateCandidate;
  reason: string;
  matchEvidence: DuplicateMatchEvidence[];
  conflictingFields: ComparedCustomerField[];
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
        where: excludeErasedCustomers({ businessId }),
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          address: true,
        },
        orderBy: { id: 'asc' },
      }),
      this.mergeSettings.get(businessId),
      this.tenantPrisma.client.customerDuplicateDismissal.findMany({
        where: { businessId },
      }),
    ]);

    const dismissedKeys = new Set(
      dismissals.map((d) => `${d.customerIdLow}:${d.customerIdHigh}`),
    );
    const pairs = this.findPairs(customers, settings.matchOn);
    return pairs.filter((p) => {
      const [low, high] = sortedPair(p.a.id, p.b.id);
      return !dismissedKeys.has(`${low}:${high}`);
    });
  }

  /** Privacy-minimized aggregate for specialist reviews; never returns customer identifiers. */
  async summary(businessId: string) {
    const pairs = await this.list(businessId);
    const signalsByPair = new Map<string, Set<DuplicateMatchField>>();
    for (const pair of pairs) {
      const [low, high] = sortedPair(pair.a.id, pair.b.id);
      const key = `${low}:${high}`;
      const signals = signalsByPair.get(key) ?? new Set<DuplicateMatchField>();
      for (const evidence of pair.matchEvidence) signals.add(evidence.field);
      signalsByPair.set(key, signals);
    }
    let sharedEmailPairCount = 0;
    let sharedPhonePairCount = 0;
    for (const signals of signalsByPair.values()) {
      if (signals.has('email')) sharedEmailPairCount += 1;
      if (signals.has('phone')) sharedPhonePairCount += 1;
    }
    return {
      exactMatchCandidatePairCount: signalsByPair.size,
      sharedEmailPairCount,
      sharedPhonePairCount,
    };
  }

  async dismiss(
    businessId: string,
    userId: string,
    dto: DismissCustomerDuplicateDto,
  ) {
    const [customerIdLow, customerIdHigh] = sortedPair(
      dto.customerIdA,
      dto.customerIdB,
    );
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
    customers: {
      id: string;
      name: string;
      phone: string;
      email: string | null;
      address: string | null;
    }[],
    matchOn: 'phone_or_email' | 'phone_only' | 'name_and_phone',
  ): DuplicatePair[] {
    const pairs = new Map<
      string,
      {
        a: DuplicateCandidate;
        b: DuplicateCandidate;
        fields: Set<DuplicateMatchField>;
      }
    >();
    const toCandidate = (
      c: (typeof customers)[number],
    ): DuplicateCandidate => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
    });
    const addPair = (
      first: (typeof customers)[number],
      second: (typeof customers)[number],
      field: DuplicateMatchField,
    ) => {
      const [low, high] = sortedPair(first.id, second.id);
      const key = `${low}:${high}`;
      const existing = pairs.get(key);
      if (existing) {
        existing.fields.add(field);
        return;
      }
      const [a, b] = first.id === low ? [first, second] : [second, first];
      pairs.set(key, {
        a: toCandidate(a),
        b: toCandidate(b),
        fields: new Set([field]),
      });
    };

    if (matchOn !== 'phone_only') {
      const byEmail = new Map<string, typeof customers>();
      for (const c of customers) {
        const key = c.email?.trim().toLowerCase();
        if (!key) continue;
        byEmail.set(key, [...(byEmail.get(key) ?? []), c]);
      }
      for (const group of byEmail.values()) {
        for (let i = 1; i < group.length; i++) {
          addPair(group[0], group[i], 'email');
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
          group[0].name.trim().toLowerCase() ===
          group[i].name.trim().toLowerCase();
        if (matchOn === 'name_and_phone' && !nameMatches) continue;
        addPair(group[0], group[i], 'phone');
      }
    }

    return [...pairs.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, pair]) => {
        const matchEvidence: DuplicateMatchEvidence[] = [];
        if (pair.fields.has('email')) {
          matchEvidence.push({
            field: 'email',
            method: 'trimmed_case_insensitive',
            label: 'Email matches after trimming spaces and ignoring case',
          });
        }
        if (pair.fields.has('phone')) {
          matchEvidence.push({
            field: 'phone',
            method: 'digits_only',
            label: 'Phone digits match after punctuation is removed',
          });
        }
        const compared: ComparedCustomerField[] = [
          'name',
          'phone',
          'email',
          'address',
        ];
        const normalize: Record<
          ComparedCustomerField,
          (candidate: DuplicateCandidate) => string
        > = {
          name: (candidate) => candidate.name.trim().toLowerCase(),
          phone: (candidate) => candidate.phone.replace(/\D/g, ''),
          email: (candidate) => candidate.email?.trim().toLowerCase() ?? '',
          address: (candidate) =>
            candidate.address?.trim().replace(/\s+/g, ' ').toLowerCase() ?? '',
        };
        const conflictingFields = compared.filter(
          (field) => normalize[field](pair.a) !== normalize[field](pair.b),
        );
        const matchedLabels = matchEvidence.map((evidence) =>
          evidence.field === 'email'
            ? 'Same email address'
            : 'Same phone number',
        );
        return {
          a: pair.a,
          b: pair.b,
          reason: matchedLabels.join(' and '),
          matchEvidence,
          conflictingFields,
        };
      });
  }
}
