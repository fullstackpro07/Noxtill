import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import {
  Business,
  Citation,
  Integration,
  IntegrationProvider,
  IntegrationStatus,
  ListingSyncLog,
  MasterListing,
} from '@prisma/client';

const PROVIDER_LABELS: Partial<Record<IntegrationProvider, string>> = {
  gmb: 'Google Business Profile',
  bing_places: 'Bing Places',
  apple_business_connect: 'Apple Business Connect',
  yelp: 'Yelp',
};

/** Fields a completeness score checks — the same NAP set `ListingSyncService` audits, plus the profile-shape fields it doesn't (categories, hours, at least one photo). */
const COMPLETENESS_TEXT_FIELDS = [
  'name',
  'phone',
  'website',
  'addressLine1',
  'city',
  'state',
  'postalCode',
  'country',
  'description',
] as const;

export interface ListingRollupItem {
  branchId: string;
  branchName: string;
  /** From this branch's own real Master Listing — null when one hasn't been set up yet. */
  businessName: string | null;
  phone: string | null;
  address: string | null;
  category: string | null;
  provider: IntegrationProvider;
  providerLabel: string;
  hasMasterListing: boolean;
  status: 'Connected' | 'Needs attention' | 'Disconnected' | 'Not connected';
  /** No provider in this codebase exposes a real verification API — never fabricated as Verified/Pending. */
  verification: 'Not tracked';
  lastSyncedAt: string | null;
  lastSyncStatus: 'success' | 'failed' | null;
  lastSyncMessage: string | null;
  /** null when there's no Master Listing yet for this branch — a real "0%", not a fabricated one. */
  completenessPercent: number | null;
  /** This branch's total real photo count (shared across every provider row for the branch). */
  photoCount: number;
  mismatchedFields: string[];
  nextAction: string;
  nextWhy: string;
}

export interface ListingsRollupSummary {
  totalListings: number;
  totalBranches: number;
  totalProviders: number;
  connected: number;
  needsAttention: number;
  disconnected: number;
  notConnected: number;
  mismatchCount: number;
  averageCompleteness: number | null;
  branchesWithoutMasterListing: number;
}

/**
 * Business Listings unified rollup (UPD-FE fabrication fix) — the Overview/All Listings/Locations
 * screens need one real row per (branch × directory provider) across a business's whole branch
 * group, which no existing endpoint returns (`ListingSyncService` only ever reads the CLS-bound
 * CURRENT business). Deliberately uses the raw `PrismaService` + `BranchScopeService`, the same
 * cross-branch pattern as `RollupService` (Profit & Analytics) — each branch is a real sibling
 * `Business` row with its OWN `MasterListing`/`Integration`/`Citation` rows, so this reads across
 * that whole real group rather than fabricating per-branch data that doesn't exist.
 */
@Injectable()
export class ListingsRollupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly connectors: ConnectorRegistry,
  ) {}

  async overview(businessId: string): Promise<ListingRollupItem[]> {
    const ids = await this.branchScope.resolveIds(businessId, 'all');
    const providers = this.connectors.directoryProviders();

    const [branches, masterListings, integrations, citations, photoCounts, syncLogs] =
      await Promise.all([
        this.prisma.business.findMany({
          where: { id: { in: ids } },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.masterListing.findMany({
          where: { businessId: { in: ids } },
        }),
        this.prisma.integration.findMany({
          where: { businessId: { in: ids }, provider: { in: providers } },
        }),
        this.prisma.citation.findMany({
          where: { businessId: { in: ids }, provider: { in: providers } },
        }),
        this.prisma.listingPhoto.groupBy({
          by: ['businessId'],
          where: { businessId: { in: ids } },
          _count: { _all: true },
        }),
        // Most-recent-first; the first row seen per (businessId, provider) key below is the latest.
        this.prisma.listingSyncLog.findMany({
          where: { businessId: { in: ids }, provider: { in: providers } },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    const masterByBiz = new Map(masterListings.map((m) => [m.businessId, m]));
    const photoCountByBiz = new Map(
      photoCounts.map((p) => [p.businessId, p._count._all]),
    );
    const integrationByKey = new Map(
      integrations.map((i) => [`${i.businessId}:${i.provider}`, i]),
    );
    const citationByKey = new Map(
      citations.map((c) => [`${c.businessId}:${c.provider}`, c]),
    );
    const latestSyncByKey = new Map<string, ListingSyncLog>();
    for (const log of syncLogs) {
      const key = `${log.businessId}:${log.provider}`;
      if (!latestSyncByKey.has(key)) latestSyncByKey.set(key, log);
    }

    const items: ListingRollupItem[] = [];
    for (const branch of branches) {
      const listing = masterByBiz.get(branch.id) ?? null;
      const photoCount = photoCountByBiz.get(branch.id) ?? 0;
      const completeness = this.completeness(listing, photoCount);

      for (const provider of providers) {
        const key = `${branch.id}:${provider}`;
        items.push(
          this.buildItem(
            branch,
            provider,
            listing,
            integrationByKey.get(key) ?? null,
            citationByKey.get(key) ?? null,
            latestSyncByKey.get(key) ?? null,
            completeness,
            photoCount,
          ),
        );
      }
    }
    return items;
  }

  async summary(businessId: string): Promise<ListingsRollupSummary> {
    const items = await this.overview(businessId);
    const branchIds = new Set(items.filter((i) => !i.hasMasterListing).map((i) => i.branchId));
    const allBranchIds = new Set(items.map((i) => i.branchId));
    const completenessValues = items
      .filter((i) => i.completenessPercent != null)
      .map((i) => i.completenessPercent as number);

    return {
      totalListings: items.length,
      totalBranches: allBranchIds.size,
      totalProviders: this.connectors.directoryProviders().length,
      connected: items.filter((i) => i.status === 'Connected').length,
      needsAttention: items.filter((i) => i.status === 'Needs attention').length,
      disconnected: items.filter((i) => i.status === 'Disconnected').length,
      notConnected: items.filter((i) => i.status === 'Not connected').length,
      mismatchCount: items.reduce((sum, i) => sum + i.mismatchedFields.length, 0),
      averageCompleteness:
        completenessValues.length === 0
          ? null
          : Math.round(
              completenessValues.reduce((a, b) => a + b, 0) /
                completenessValues.length,
            ),
      branchesWithoutMasterListing: branchIds.size,
    };
  }

  private buildItem(
    branch: Business,
    provider: IntegrationProvider,
    listing: MasterListing | null,
    integration: Integration | null,
    citation: Citation | null,
    lastSync: ListingSyncLog | null,
    completenessPercent: number | null,
    photoCount: number,
  ): ListingRollupItem {
    const providerLabel = PROVIDER_LABELS[provider] ?? provider;
    const mismatchedFields =
      citation && listing ? this.diffFields(citation, listing) : [];

    let status: ListingRollupItem['status'];
    if (!integration || integration.status === IntegrationStatus.not_connected) {
      status = 'Not connected';
    } else if (integration.status === IntegrationStatus.needs_attention) {
      status = 'Disconnected';
    } else if (mismatchedFields.length > 0) {
      status = 'Needs attention';
    } else {
      status = 'Connected';
    }

    const { nextAction, nextWhy } = this.nextStep(
      providerLabel,
      listing,
      integration,
      status,
      mismatchedFields,
      lastSync,
      completenessPercent,
    );

    return {
      branchId: branch.id,
      branchName: branch.name,
      businessName: listing?.name || null,
      phone: listing?.phone ?? null,
      address: listing
        ? [listing.addressLine1, listing.city].filter(Boolean).join(', ') || null
        : null,
      category:
        Array.isArray(listing?.categories) && listing.categories.length > 0
          ? String(listing.categories[0])
          : null,
      provider,
      providerLabel,
      hasMasterListing: listing != null,
      status,
      verification: 'Not tracked',
      lastSyncedAt: lastSync ? lastSync.createdAt.toISOString() : null,
      lastSyncStatus: lastSync ? (lastSync.status as 'success' | 'failed') : null,
      lastSyncMessage: lastSync?.message ?? null,
      completenessPercent,
      photoCount,
      mismatchedFields,
      nextAction,
      nextWhy,
    };
  }

  private nextStep(
    providerLabel: string,
    listing: MasterListing | null,
    integration: Integration | null,
    status: ListingRollupItem['status'],
    mismatchedFields: string[],
    lastSync: ListingSyncLog | null,
    completenessPercent: number | null,
  ): { nextAction: string; nextWhy: string } {
    if (!listing) {
      return {
        nextAction: 'Set up your Master Business Record before this can sync.',
        nextWhy:
          'No name, address or phone has been entered yet, so nothing can be pushed to any directory for this location.',
      };
    }
    if (status === 'Not connected') {
      return {
        nextAction: `Connect ${providerLabel} if you want a presence there.`,
        nextWhy: `No ${providerLabel} listing is connected for this location. Noxtill will not create one automatically.`,
      };
    }
    if (status === 'Disconnected') {
      return {
        nextAction: `Reconnect ${providerLabel} — its authorisation needs attention.`,
        nextWhy: `While the authorisation is invalid, Noxtill cannot read or write this listing. Health and sync show as unavailable rather than being estimated from the last known state.`,
      };
    }
    if (status === 'Needs attention') {
      return {
        nextAction: `Resolve the mismatch on ${mismatchedFields.join(', ')}.`,
        nextWhy: `Noxtill's Master Record and the last-synced ${providerLabel} snapshot disagree on: ${mismatchedFields.join(', ')}. Sync again once you've confirmed which value is correct.`,
      };
    }
    if (!lastSync) {
      return {
        nextAction: `Sync to push your Master Record to ${providerLabel}.`,
        nextWhy: `This listing is connected but has never been synced, so Noxtill cannot yet confirm ${providerLabel} matches your records.`,
      };
    }
    if (completenessPercent != null && completenessPercent < 100) {
      return {
        nextAction: 'Fill in the remaining profile fields for this location.',
        nextWhy: `The Master Record for this location is ${completenessPercent}% complete. The missing fields apply to every connected directory, not just ${providerLabel}.`,
      };
    }
    return {
      nextAction: 'Nothing to do — this listing is healthy.',
      nextWhy: `${providerLabel} is connected, synced and matches your Master Record.`,
    };
  }

  private completeness(
    listing: MasterListing | null,
    photoCount: number,
  ): number | null {
    if (!listing) return null;
    const record = listing as unknown as Record<string, unknown>;
    const filledTextFields = COMPLETENESS_TEXT_FIELDS.filter((field) => {
      const value = record[field];
      return value != null && String(value).trim() !== '';
    }).length;
    const categoriesFilled =
      Array.isArray(listing.categories) && listing.categories.length > 0 ? 1 : 0;
    const hoursFilled =
      listing.hours && Object.keys(listing.hours as Record<string, unknown>).length > 0
        ? 1
        : 0;
    const photosFilled = photoCount > 0 ? 1 : 0;

    const totalChecks = COMPLETENESS_TEXT_FIELDS.length + 3;
    const filledChecks =
      filledTextFields + categoriesFilled + hoursFilled + photosFilled;
    return Math.round((filledChecks / totalChecks) * 100);
  }

  private diffFields(citation: Citation, listing: MasterListing): string[] {
    const snapshot = citation.snapshot as Record<string, unknown>;
    const current = listing as unknown as Record<string, unknown>;
    return COMPLETENESS_TEXT_FIELDS.filter(
      (field) => field !== 'description' && (snapshot[field] ?? null) !== (current[field] ?? null),
    );
  }
}
