import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

/**
 * Learned aliases (UPD-BE-063) — a per-business map from a raw vision misread to the owner's own
 * correction, built up one `PATCH /digitizer/rows/:id` correction at a time and replayed onto
 * every future scan's raw extraction before it's staged, so a recurring misread (a shop's own
 * product name, a regular supplier's name, etc.) only ever needs correcting once.
 */
@Injectable()
export class DigitizerAliasService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getMap(businessId: string): Promise<Map<string, string>> {
    const aliases = await this.tenantPrisma.client.digitizerAlias.findMany({
      where: { businessId },
    });
    return new Map(aliases.map((a) => [a.rawText, a.correctedText]));
  }

  /** Upserts a learned correction — only worth remembering when the text actually changed. */
  async learn(
    businessId: string,
    rawText: string,
    correctedText: string,
  ): Promise<void> {
    if (!rawText || !correctedText || rawText === correctedText) return;

    await this.tenantPrisma.client.digitizerAlias.upsert({
      where: { businessId_rawText: { businessId, rawText } },
      create: { businessId, rawText, correctedText },
      update: { correctedText },
    });
  }

  /** Scanner Settings depth fix — a real, visible list of every learned correction, not just an internal replay map. */
  list(businessId: string) {
    return this.tenantPrisma.client.digitizerAlias.findMany({
      where: { businessId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Lets the owner remove a bad learned alias (e.g. a one-off correction that shouldn't generalize). */
  async remove(businessId: string, id: string): Promise<void> {
    const alias = await this.tenantPrisma.client.digitizerAlias.findUnique({
      where: { id },
    });
    if (!alias || alias.businessId !== businessId) {
      throw new NotFoundException('Learned alias not found');
    }
    await this.tenantPrisma.client.digitizerAlias.delete({ where: { id } });
  }

  /** Applies every known alias as a literal substring replacement over a raw extracted value. */
  applyAliases(value: string, aliases: Map<string, string>): string {
    let result = value;
    for (const [rawText, correctedText] of aliases) {
      if (result.includes(rawText)) {
        result = result.split(rawText).join(correctedText);
      }
    }
    return result;
  }
}
