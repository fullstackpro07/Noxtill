import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { IntegrationsService } from '../integrations/integrations.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { MasterListingService } from './master-listing.service';
import { LISTING_ERROR_CODES } from './listings.constants';
import { IntegrationStatus, Prisma } from '../../generated/prisma';

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
  ) {}

  async sync(businessId: string): Promise<SyncResult[]> {
    const listing = await this.masterListing.find(businessId);
    if (!listing) {
      throw new AppException(
        LISTING_ERROR_CODES.MASTER_LISTING_NOT_SET,
        'Set the Master Business Record before syncing to directories',
        HttpStatus.BAD_REQUEST,
      );
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
        await connector.pushListing(
          tokens,
          data,
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
            snapshot: data as unknown as Prisma.InputJsonValue,
            syncedAt: new Date(),
          },
          update: {
            snapshot: data as unknown as Prisma.InputJsonValue,
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

    return citations.map((citation) => {
      const snapshot = citation.snapshot as Record<string, unknown>;
      const mismatchedFields = listing
        ? this.diffFields(snapshot, listing)
        : NAP_FIELDS.slice();
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
  ): string[] {
    return NAP_FIELDS.filter(
      (field) => (snapshot[field] ?? null) !== (current[field] ?? null),
    );
  }
}
