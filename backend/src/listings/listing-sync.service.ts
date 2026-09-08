import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { IntegrationsService } from '../integrations/integrations.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { MasterListingService } from './master-listing.service';
import { ListingSettingsService } from './listing-settings.service';
import { LISTING_ERROR_CODES } from './listings.constants';
import { MasterListingData } from '../integrations/connector.interface';
import { IntegrationStatus, Prisma } from '@prisma/client';

const RECENT_SYNC_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const NAP_FIELDS = [
  'name',
  'phone',
  'website',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
] as const;

export interface SyncResult {
  provider: string;
  status: 'success' | 'failed';
  message?: string;
}

/**
 * Business Listings sync/health/citation-audit (UPD-BE-044). `sync()` pushes the current Master
 * Listing to every connected directory-type integration (discovered via
 * `ConnectorRegistry.directoryProviders()`, not a hardcoded list) and records the outcome as a
 * `ListingSyncLog` row + (on success) a fresh `Citation` snapshot.
 */
@Injectable()
export class ListingSyncService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    private readonly connectors: ConnectorRegistry,
    private readonly masterListing: MasterListingService,
    private readonly listingSettings: ListingSettingsService,
  ) {}

  async sync(businessId: string): Promise<SyncResult[]> {
    let listing = await this.masterListing.find(businessId);
    if (!listing) {
      throw new AppException(
        LISTING_ERROR_CODES.MASTER_LISTING_NOT_SET,
        'Set the Master Business Record before syncing to directories',
        HttpStatus.BAD_REQUEST,
      );
    }
    const settings = await this.listingSettings.get(businessId);
    const fieldMapping = settings.fieldMapping as Record<string, string[]>;

    if (settings.conflictResolution === 'directory_wins') {
      listing = (await this.reconcile(businessId, fieldMapping)) ?? listing;
    }

    const data = this.masterListing.toConnectorData(listing);

    const results: SyncResult[] = [];
    for (const provider of this.connectors.directoryProviders()) {
      const integration = await this.tenantPrisma.client.integration.findUnique(
        {
          where: { businessId_provider: { businessId, provider } },
        },
      );
      if (!integration || integration.status !== IntegrationStatus.connected) {
        continue;
      }

      const tokens = await this.integrations.getTokens(businessId, provider);
      const connector = this.connectors.get(provider);
      if (!tokens || !connector.pushListing) continue;

      try {
        const sentData = this.applyFieldMapping(data, fieldMapping[provider]);
        await connector.pushListing(
          tokens,
          sentData,
          integration.meta as Record<string, unknown>,
        );
        await this.tenantPrisma.client.listingSyncLog.create({
          data: { businessId, provider, status: 'success' },
        });
        await this.tenantPrisma.client.citation.upsert({
          where: { businessId_provider: { businessId, provider } },
          create: {
            businessId,
            provider,
            snapshot: sentData as unknown as Prisma.InputJsonValue,
            syncedAt: new Date(),
          },
          update: {
            snapshot: sentData as unknown as Prisma.InputJsonValue,
            syncedAt: new Date(),
          },
        });
        results.push({ provider, status: 'success' });
      } catch (error) {
        const message = (error as Error).message;
        await this.tenantPrisma.client.listingSyncLog.create({
          data: { businessId, provider, status: 'failed', message },
        });
        results.push({ provider, status: 'failed', message });
      }
    }
    return results;
  }

  listSyncLog(businessId: string) {
    return this.tenantPrisma.client.listingSyncLog.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Citation Audit (UPD-BE-044) — compares each provider's last-successfully-synced `Citation`
   * snapshot against the CURRENT Master Listing. Deliberately not a live pull of the directory's
   * real current data (see `Citation`'s doc comment in schema.prisma) — flags drift relative to
   * our own records, since none of the 4 directory providers have a real sandbox credential here.
   */
  async citationAudit(businessId: string) {
    const listing = await this.masterListing.find(businessId);
    const citations = await this.tenantPrisma.client.citation.findMany({
      where: { businessId },
    });
    const fieldMapping =
      await this.listingSettings.findFieldMapping(businessId);

    return citations.map((citation) => {
      const snapshot = citation.snapshot as Record<string, unknown>;
      const excluded = new Set(fieldMapping[citation.provider] ?? []);
      const mismatchedFields = listing
        ? this.diffFields(snapshot, listing, excluded)
        : NAP_FIELDS.filter((f) => !excluded.has(f));
      return {
        provider: citation.provider,
        syncedAt: citation.syncedAt,
        matches: mismatchedFields.length === 0,
        mismatchedFields,
      };
    });
  }

  async health(businessId: string) {
    const directoryProviders = this.connectors.directoryProviders();
    const integrations = await this.tenantPrisma.client.integration.findMany({
      where: { businessId, provider: { in: directoryProviders } },
    });
    const connected = integrations.filter(
      (integration) => integration.status === IntegrationStatus.connected,
    );

    const recentSync = await this.tenantPrisma.client.listingSyncLog.findFirst({
      where: {
        businessId,
        status: 'success',
        createdAt: { gte: new Date(Date.now() - RECENT_SYNC_WINDOW_MS) },
      },
    });

    const citationAudit = await this.citationAudit(businessId);
    const mismatchCount = citationAudit.filter((c) => !c.matches).length;

    const connectivityScore =
      directoryProviders.length === 0
        ? 0
        : Math.round((connected.length / directoryProviders.length) * 100);
    const recencyPenalty = recentSync ? 0 : 20;
    const mismatchPenalty = Math.min(mismatchCount * 10, 30);
    const score = Math.max(
      0,
      connectivityScore - recencyPenalty - mismatchPenalty,
    );

    return {
      score,
      totalProviders: directoryProviders.length,
      connectedProviders: connected.map((integration) => integration.provider),
      hasRecentSync: Boolean(recentSync),
      mismatchCount,
    };
  }

  private diffFields(
    snapshot: Record<string, unknown>,
    current: Record<string, unknown>,
    excluded: Set<string>,
  ): string[] {
    return NAP_FIELDS.filter(
      (field) =>
        !excluded.has(field) &&
        (snapshot[field] ?? null) !== (current[field] ?? null),
    );
  }

  /**
   * Listings Settings conflict resolution (UPD-BE-125) — the real mechanism `conflictResolution`
   * was missing: when set to `directory_wins`, pulls each connected reconcile-capable provider's
   * CURRENT data via `fetchListing` and overwrites the real Master Listing's fields with theirs
   * (excluding any field mapped out for that provider, same as the push side). If more than one
   * provider disagrees, the last one processed wins — providers are iterated in
   * `ConnectorRegistry`'s fixed order, so this is at least deterministic. A provider whose
   * `fetchListing` call fails is skipped here (not fatal) — the same failure surfaces for real
   * moments later when that provider's own push in the loop below is attempted.
   */
  private async reconcile(
    businessId: string,
    fieldMapping: Record<string, string[]>,
  ) {
    const updates: Partial<Omit<MasterListingData, 'categories' | 'hours'>> =
      {};

    for (const provider of this.connectors.reconcileProviders()) {
      const integration = await this.tenantPrisma.client.integration.findUnique(
        { where: { businessId_provider: { businessId, provider } } },
      );
      if (!integration || integration.status !== IntegrationStatus.connected) {
        continue;
      }
      const tokens = await this.integrations.getTokens(businessId, provider);
      const connector = this.connectors.get(provider);
      if (!tokens || !connector.fetchListing) continue;

      try {
        const remote = await connector.fetchListing(
          tokens,
          integration.meta as Record<string, unknown>,
        );
        const excluded = new Set(fieldMapping[provider] ?? []);
        for (const field of NAP_FIELDS) {
          if (excluded.has(field)) continue;
          const value = remote[field];
          if (value !== undefined && value !== null && value !== '') {
            updates[field] = value;
          }
        }
      } catch {
        // Read-only reconciliation failure — not fatal, see doc comment above.
      }
    }

    if (Object.keys(updates).length === 0) return null;
    return this.masterListing.applyReconciledFields(businessId, updates);
  }

  /**
   * Listings Settings (UPD-BE-125) — real field exclusion: strips any key named in
   * `excludedFields` before the data is sent to a given provider's `pushListing`, and before it's
   * stored as that provider's citation snapshot (so a deliberately-excluded field is never later
   * flagged as "stale" by the citation audit — see `citationAudit()`).
   */
  private applyFieldMapping(
    data: MasterListingData,
    excludedFields: string[] | undefined,
  ): MasterListingData {
    if (!excludedFields || excludedFields.length === 0) return data;
    const filtered = { ...data } as Record<string, unknown>;
    for (const field of excludedFields) delete filtered[field];
    return filtered as unknown as MasterListingData;
  }
}
