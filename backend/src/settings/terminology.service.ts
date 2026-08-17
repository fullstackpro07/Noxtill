import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TERMS, TERM_PATTERN } from './terminology.constants';

export interface LabelUpdate {
  area: string;
  key: string;
  value: string;
}

/**
 * Terminology Engine (UPD-BE-038) — uses the raw `PrismaService`, not `TenantPrismaService`,
 * because `applyToText()` is called from `MessageWorkerProcessor` (a background BullMQ consumer
 * with no CLS-bound tenant context), same "explicit businessId, no CLS" convention as
 * `WorkflowTriggerService`/`StockTransfersService`. The `GET/PATCH /labels` HTTP paths use the
 * exact same service, just with `businessId` sourced from `CurrentUser()` instead.
 */
@Injectable()
export class TerminologyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Full resolved set (real defaults merged with real overrides), grouped by area. */
  async getAll(
    businessId: string,
  ): Promise<Record<string, Record<string, string>>> {
    const overrides = await this.prisma.labelOverride.findMany({
      where: { businessId },
    });

    const result: Record<string, Record<string, string>> = {};
    for (const [area, terms] of Object.entries(DEFAULT_TERMS)) {
      result[area] = { ...terms };
    }
    for (const override of overrides) {
      result[override.area] = result[override.area] ?? {};
      result[override.area][override.key] = override.value;
    }
    return result;
  }

  /** One area's resolved terms — e.g. `getArea(businessId, 'pdf')` for a document generator's labels. */
  async getArea(
    businessId: string,
    area: string,
  ): Promise<Record<string, string>> {
    const all = await this.getAll(businessId);
    return all[area] ?? {};
  }

  async setMany(businessId: string, updates: LabelUpdate[]) {
    if (updates.length === 0) return this.getAll(businessId);

    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.labelOverride.upsert({
          where: {
            businessId_area_key: { businessId, area: u.area, key: u.key },
          },
          create: { businessId, area: u.area, key: u.key, value: u.value },
          update: { value: u.value },
        }),
      ),
    );

    return this.getAll(businessId);
  }

  /**
   * Replaces every `{{term:key}}`/`{{term:area.key}}` in `text` with the business's resolved
   * term (override if set, else the real default, else the bare key as a last resort so a typo'd
   * term never renders as a broken `{{...}}` placeholder). Skips the DB round-trip entirely when
   * the text contains no term placeholders at all — the common case for most templates.
   */
  async applyToText(businessId: string, text: string): Promise<string> {
    if (!text.includes('{{term:')) return text;

    const resolved = await this.getAll(businessId);
    return text.replace(
      TERM_PATTERN,
      (_match, area: string | undefined, key: string) => {
        const resolvedArea = area ?? 'general';
        return resolved[resolvedArea]?.[key] ?? key;
      },
    );
  }
}
