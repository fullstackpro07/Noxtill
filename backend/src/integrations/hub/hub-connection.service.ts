import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { AppException } from '../../common/filters/app.exception';
import { ConnectionDetailService } from '../connection-detail/connection-detail.service';
import {
  IntegrationAuditService,
  INTEGRATION_AUDIT_ENTITY,
} from '../integration-audit.service';
import { ACCOUNTING_PROVIDERS } from '../accounting/accounting.constants';
import { ECOMMERCE_PROVIDERS } from '../ecommerce/ecommerce.constants';
import { HubStateService } from './hub-state.service';
import { catalogByKey, HubProviderDef } from './hub.catalog';
import { HubProviderCard } from './hub.types';
import {
  IntegrationProvider,
  type IntegrationSyncLog,
  type ListingSyncLog,
} from '@prisma/client';

export interface HubRow {
  label: string;
  value: string;
  tone?: 'pos' | 'neg' | 'muted';
}

export interface HubSyncLogEntry {
  at: string;
  success: boolean;
  records: number;
  failed: number;
  durationMs: number | null;
  message: string | null;
}

export interface HubMappingRow {
  noxtill: string;
  external: string;
  direction: 'Inbound' | 'Outbound' | 'Two-way' | '—';
  status: 'Mapped' | 'Conflict' | 'Unmapped' | 'Needs review' | 'Not synced';
}

export interface HubAuditEntry {
  at: string;
  action: string;
  actor: string;
  detail: string | null;
}

export interface HubConnectionDetail {
  card: HubProviderCard;
  overview: HubRow[];
  health: HubRow[];
  activity: HubRow[];
  syncLog: HubSyncLogEntry[];
  fieldMapping: {
    rows: HubMappingRow[];
    editor: 'accounting' | 'ecommerce' | null;
    note: string;
  };
  permissions: HubRow[];
  modules: HubRow[];
  errors: { rows: HubRow[]; log: HubSyncLogEntry[] };
  audit: HubAuditEntry[];
}

const DAY_MS = 86_400_000;

const ACTION_LABELS: Record<string, string> = {
  'integration.connected': 'Connected',
  'integration.connect_failed': 'Connection attempt failed',
  'integration.disconnected': 'Disconnected',
  'integration.paused': 'Paused',
  'integration.resumed': 'Resumed',
  'integration.sync_requested': 'Sync run',
  'integration.mapping_changed': 'Mapping changed',
  'integration.source_of_truth_changed': 'Source of truth changed',
  'integration.conflict_resolved': 'Conflict resolved',
};

/** "1 inbox item" / "2 inbox items": the first plural word of the unit loses its s at exactly one. */
function recordsText(count: number, unit: string): string {
  const words = unit.split(' ');
  if (count === 1) {
    const i = words.findIndex((w) => /[^s]s$/.test(w));
    if (i >= 0) words[i] = words[i].slice(0, -1);
  }
  return `${count.toLocaleString('en-US')} ${words.join(' ')}`;
}

function when(d: Date | string | null | undefined): string {
  if (!d) return 'Never';
  const date = new Date(d);
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function stamp(d: Date | string | null | undefined): string {
  if (!d) return 'Never';
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * The connection-detail drawer's nine sections, each built only from real rows: `Integration`,
 * `IntegrationSyncLog`/`ListingSyncLog`, `EcommerceSyncConflict`, `AccountingMapping`, `AuditLog`.
 * Anything Noxtill does not measure is reported as "Not tracked" rather than guessed.
 */
@Injectable()
export class HubConnectionService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly state: HubStateService,
    private readonly connectionDetail: ConnectionDetailService,
    private readonly audit: IntegrationAuditService,
  ) {}

  private def(key: string): HubProviderDef {
    const def = catalogByKey(key);
    if (!def) {
      throw new AppException(
        'INTEGRATION_UNKNOWN',
        `Unknown integration: ${key}`,
        HttpStatus.NOT_FOUND,
      );
    }
    return def;
  }

  private provider(def: HubProviderDef): IntegrationProvider | null {
    return def.source.type === 'integration' ? def.source.provider : null;
  }

  async detail(businessId: string, key: string): Promise<HubConnectionDetail> {
    const def = this.def(key);
    const cards = await this.state.cards(businessId);
    const card = cards.find((c) => c.key === key)!;
    const provider = this.provider(def);
    const db = this.tenantPrisma.client;
    const since = new Date(Date.now() - 14 * DAY_MS);
    const connected = card.status !== 'not_connected';

    const noLogs: Promise<IntegrationSyncLog[]> = Promise.resolve([]);
    const noListingLogs: Promise<ListingSyncLog[]> = Promise.resolve([]);
    const [logs, listingLogs, conflicts, mappings, auditRows, integration] =
      await Promise.all([
        provider
          ? db.integrationSyncLog.findMany({
              where: { businessId, provider, createdAt: { gte: since } },
              orderBy: { createdAt: 'desc' },
              take: 200,
            })
          : noLogs,
        provider
          ? db.listingSyncLog.findMany({
              where: { businessId, provider, createdAt: { gte: since } },
              orderBy: { createdAt: 'desc' },
              take: 200,
            })
          : noListingLogs,
        provider && ECOMMERCE_PROVIDERS.includes(provider)
          ? db.ecommerceSyncConflict.count({
              where: { businessId, provider, status: 'pending' },
            })
          : Promise.resolve(0),
        provider && ACCOUNTING_PROVIDERS.includes(provider)
          ? db.accountingMapping.findMany({
              where: { businessId, provider },
              orderBy: { productCategory: 'asc' },
            })
          : Promise.resolve([]),
        db.auditLog.findMany({
          where: {
            businessId,
            entity: INTEGRATION_AUDIT_ENTITY,
            entityId: provider ?? key,
          },
          orderBy: { createdAt: 'desc' },
          take: 40,
        }),
        provider
          ? db.integration.findUnique({
              where: { businessId_provider: { businessId, provider } },
            })
          : Promise.resolve(null),
      ]);

    const log: HubSyncLogEntry[] = [
      ...logs.map((l) => ({
        at: l.createdAt.toISOString(),
        success: l.success,
        records: l.recordsProcessed,
        failed: l.recordsFailed,
        durationMs: l.durationMs,
        message: l.message,
      })),
      ...listingLogs.map((l) => ({
        at: l.createdAt.toISOString(),
        success: l.status === 'success',
        records: l.status === 'success' ? 1 : 0,
        failed: l.status === 'success' ? 0 : 1,
        durationMs: null,
        message: l.message,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));

    const ok = log.filter((l) => l.success);
    const failed = log.filter((l) => !l.success);
    const durations = log
      .map((l) => l.durationMs)
      .filter((d): d is number => typeof d === 'number');
    const avgMs = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

    const attemptDiffers =
      !!card.lastAttemptAt &&
      card.lastAttemptAt !== card.lastSuccessAt &&
      failed.length > 0 &&
      log[0] &&
      !log[0].success;

    const overview: HubRow[] = connected
      ? [
          {
            label: 'Status',
            value:
              card.status === 'needs_attention'
                ? 'Needs attention'
                : card.status === 'paused'
                  ? 'Paused'
                  : 'Connected',
          },
          {
            label: 'Connected since',
            value: card.connectedAt ? stamp(card.connectedAt) : 'Not recorded',
          },
          {
            label: 'Last successful sync',
            value:
              card.syncMode === 'event'
                ? 'Event-driven — nothing to sync'
                : card.lastSuccessAt
                  ? when(card.lastSuccessAt)
                  : 'No sync yet',
          },
          {
            label: 'Records',
            value:
              card.records === null
                ? 'Not tracked'
                : recordsText(card.records, card.recordsUnit),
          },
          { label: 'Direction', value: card.direction },
          {
            label: 'Sync errors today',
            value: String(card.errorsToday),
            tone: card.errorsToday > 0 ? 'neg' : 'pos',
          },
          {
            label: 'Token',
            value: card.token.label,
            tone:
              card.token.state === 'valid'
                ? undefined
                : card.token.state === 'not_applicable'
                  ? 'muted'
                  : 'neg',
          },
          {
            label: 'Account connected',
            value: card.externalAccountName ?? 'Not recorded',
          },
          { label: 'Category', value: card.category },
        ]
      : [
          { label: 'Status', value: 'Not connected' },
          { label: 'What it does', value: card.benefit },
          { label: 'Direction available', value: card.direction },
          { label: 'Modules it would affect', value: card.modules.join(' · ') },
          { label: 'Permissions requested', value: card.permissions },
          {
            label: 'Platform setup',
            value: card.setupRequired
              ? 'Credentials not configured on this server'
              : 'Ready to connect',
            tone: card.setupRequired ? 'neg' : 'pos',
          },
        ];

    const health: HubRow[] = connected
      ? [
          { label: 'Connection', value: 'Established', tone: 'pos' },
          {
            label: 'Authentication',
            value: card.token.label,
            tone:
              card.token.state === 'valid'
                ? 'pos'
                : card.token.state === 'not_applicable'
                  ? 'muted'
                  : 'neg',
          },
          {
            label: 'Last attempted sync',
            value:
              card.syncMode === 'event'
                ? 'Event-driven — nothing to sync'
                : card.lastAttemptAt
                  ? when(card.lastAttemptAt)
                  : 'Never',
          },
          {
            label: 'Last successful sync',
            value:
              card.syncMode === 'event'
                ? 'Event-driven — nothing to sync'
                : card.lastSuccessAt
                  ? when(card.lastSuccessAt)
                  : 'Never',
            tone: attemptDiffers ? 'neg' : card.lastSuccessAt ? 'pos' : 'muted',
          },
          {
            label: 'Attempted and successful differ',
            value: attemptDiffers ? 'Yes · syncs are failing' : 'No',
            tone: attemptDiffers ? 'neg' : 'pos',
          },
          {
            label: 'Sync state',
            value:
              card.status === 'paused'
                ? `Paused by owner · ${when(integration?.pausedAt)}`
                : 'Active',
          },
          { label: 'Provider status', value: 'Not tracked', tone: 'muted' },
          {
            label: 'Provider rate-limit headroom',
            value: 'Not tracked',
            tone: 'muted',
          },
        ]
      : [
          { label: 'Connection', value: 'None' },
          { label: 'Health', value: 'Not applicable', tone: 'muted' },
        ];

    const activity: HubRow[] = connected
      ? [
          { label: 'Successful syncs', value: String(ok.length), tone: 'pos' },
          {
            label: 'Failed syncs',
            value: String(failed.length),
            tone: failed.length ? 'neg' : undefined,
          },
          {
            label: 'Records processed',
            value: ok
              .reduce((n, l) => n + l.records, 0)
              .toLocaleString('en-US'),
          },
          {
            label: 'Records that failed',
            value: log
              .reduce((n, l) => n + l.failed, 0)
              .toLocaleString('en-US'),
            tone: log.some((l) => l.failed > 0) ? 'neg' : undefined,
          },
          {
            label: 'Conflicts queued',
            value:
              provider && ECOMMERCE_PROVIDERS.includes(provider)
                ? `${conflicts}${conflicts ? ' · awaiting your decision' : ''}`
                : 'Not applicable',
            tone: conflicts ? 'neg' : 'muted',
          },
          {
            label: 'Average sync duration',
            value:
              avgMs === null
                ? 'Not tracked'
                : `${(avgMs / 1000).toFixed(1)} seconds`,
            tone: avgMs === null ? 'muted' : undefined,
          },
          { label: 'Sync schedule', value: this.schedule(def, provider) },
        ]
      : [{ label: 'Sync activity', value: 'None yet', tone: 'muted' }];
    if (provider === IntegrationProvider.google_analytics && connected) {
      const traffic = await db.webTrafficDaily.aggregate({
        where: { businessId, provider, day: { gte: since } },
        _sum: { sessions: true, conversions: true },
      });
      activity.push({
        label: 'Sessions · last 14 days',
        value: (traffic._sum.sessions ?? 0).toLocaleString('en-US'),
      });
      activity.push({
        label: 'Conversions · last 14 days',
        value: (traffic._sum.conversions ?? 0).toLocaleString('en-US'),
      });
    }

    const fieldMapping = this.fieldMapping(def, provider, mappings, conflicts);

    const grantedRow = auditRows.find(
      (a) => a.action === 'integration.connected',
    );
    const actorIds = [
      ...new Set(
        auditRows.map((a) => a.actorUserId).filter((id): id is string => !!id),
      ),
    ];
    const users = actorIds.length
      ? await this.tenantPrisma.client.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameOf = new Map(users.map((u) => [u.id, u.name]));

    const permissions: HubRow[] = connected
      ? [
          { label: 'Access granted', value: card.permissions },
          {
            label: 'Granted by',
            value: grantedRow?.actorUserId
              ? (nameOf.get(grantedRow.actorUserId) ?? 'Unknown user')
              : 'Not recorded',
            tone: grantedRow?.actorUserId ? undefined : 'muted',
          },
          {
            label: 'Granted on',
            value: card.connectedAt ? stamp(card.connectedAt) : 'Not recorded',
          },
          {
            label: 'Write access',
            value:
              card.direction === 'Inbound'
                ? 'No · read-only'
                : 'Yes · for the access listed above only',
          },
          {
            label: 'Revocable from Noxtill',
            value: 'Yes · Disconnect',
            tone: 'pos',
          },
        ]
      : [
          { label: 'Would request', value: card.permissions },
          {
            label: 'Revocable',
            value: 'Yes · from Noxtill after connecting',
            tone: 'pos',
          },
        ];

    const modules: HubRow[] = [
      ...card.modules.map((m) => ({
        label: m,
        value:
          card.direction === 'Two-way'
            ? 'Sends and receives data'
            : card.direction === 'Inbound'
              ? 'Receives data'
              : 'Sends data',
      })),
      ...(connected
        ? ([
            {
              label: 'Records',
              value:
                card.records === null
                  ? 'Not tracked'
                  : recordsText(card.records, card.recordsUnit),
            },
            {
              label: 'If disconnected',
              value: 'These stop updating · existing data is kept',
              tone: 'neg',
            },
          ] as HubRow[])
        : []),
    ];

    const errorRows = this.errorRows(card, log, failed, conflicts);

    const audit: HubAuditEntry[] = auditRows.map((a) => ({
      at: a.createdAt.toISOString(),
      action:
        ACTION_LABELS[a.action] ??
        a.action.replace(/^integration\./, '').replace(/_/g, ' '),
      actor: a.actorUserId
        ? (nameOf.get(a.actorUserId) ?? 'Unknown user')
        : 'System',
      detail:
        a.after && typeof a.after === 'object'
          ? JSON.stringify(a.after).slice(0, 200)
          : null,
    }));

    return {
      card,
      overview,
      health,
      activity,
      syncLog: log.slice(0, 30),
      fieldMapping,
      permissions,
      modules,
      errors: { rows: errorRows, log: failed.slice(0, 20) },
      audit,
    };
  }

  private schedule(
    def: HubProviderDef,
    provider: IntegrationProvider | null,
  ): string {
    if (
      def.category === 'Advertising' ||
      provider === IntegrationProvider.google_ads ||
      provider === IntegrationProvider.meta_ads ||
      provider === IntegrationProvider.microsoft_ads
    ) {
      return 'Hourly, plus Sync now';
    }
    if (
      def.category === 'Listings' ||
      provider === IntegrationProvider.gmb ||
      provider === IntegrationProvider.bing_places
    ) {
      return 'Per your listings auto-sync setting, plus Sync now';
    }
    if (def.connectKind === 'automation') return 'Event-driven';
    return 'On demand · Sync now';
  }

  private fieldMapping(
    def: HubProviderDef,
    provider: IntegrationProvider | null,
    mappings: Array<{
      productCategory: string | null;
      externalAccountCode: string;
      externalTaxCode: string | null;
    }>,
    conflicts: number,
  ): HubConnectionDetail['fieldMapping'] {
    if (provider && ACCOUNTING_PROVIDERS.includes(provider)) {
      return {
        editor: 'accounting',
        note: 'Each Noxtill product category maps to one ledger account code (and optional tax code). A sale whose category has no mapping and no default mapping fails loudly rather than posting to a guessed account.',
        rows: mappings.length
          ? mappings.map((m) => ({
              noxtill: m.productCategory ?? 'Default · every other category',
              external: `${m.externalAccountCode}${m.externalTaxCode ? ` · tax ${m.externalTaxCode}` : ''}`,
              direction: 'Outbound' as const,
              status: 'Mapped' as const,
            }))
          : [
              {
                noxtill: 'Default · every category',
                external: '—',
                direction: '—' as const,
                status: 'Unmapped' as const,
              },
            ],
      };
    }
    if (provider && ECOMMERCE_PROVIDERS.includes(provider)) {
      return {
        editor: 'ecommerce',
        note: 'Stock is matched by SKU and synced both ways. Online orders come in as Noxtill orders. Prices, product names and customers are not synced.',
        rows: [
          {
            noxtill: 'SKU',
            external: 'SKU (match key)',
            direction: 'Two-way',
            status: 'Mapped',
          },
          {
            noxtill: 'Stock on hand',
            external: 'Inventory quantity',
            direction: 'Two-way',
            status: conflicts ? 'Conflict' : 'Mapped',
          },
          {
            noxtill: 'Order totals and lines',
            external: 'Orders',
            direction: 'Inbound',
            status: 'Mapped',
          },
          {
            noxtill: 'Price',
            external: '—',
            direction: '—',
            status: 'Not synced',
          },
          {
            noxtill: 'Product name',
            external: '—',
            direction: '—',
            status: 'Not synced',
          },
          {
            noxtill: 'Customers',
            external: '—',
            direction: '—',
            status: 'Not synced',
          },
        ],
      };
    }
    return {
      editor: null,
      note: `${def.name} has no field mapping — it ${def.direction === 'Inbound' ? 'reads' : def.direction === 'Outbound' ? 'writes' : 'reads and writes'} the access listed under Permissions.`,
      rows: [],
    };
  }

  private errorRows(
    card: HubProviderCard,
    log: HubSyncLogEntry[],
    failed: HubSyncLogEntry[],
    conflicts: number,
  ): HubRow[] {
    if (card.status === 'not_connected')
      return [
        { label: 'Errors', value: 'None · never connected', tone: 'muted' },
      ];
    const rows: HubRow[] = [
      {
        label: 'Failed syncs today',
        value: String(card.errorsToday),
        tone: card.errorsToday ? 'neg' : 'pos',
      },
      {
        label: 'Failed syncs · 14 days',
        value: String(failed.length),
        tone: failed.length ? 'neg' : 'pos',
      },
    ];
    if (failed.length) {
      rows.push({
        label: 'Latest failure',
        value: when(failed[0].at),
        tone: 'neg',
      });
      rows.push({
        label: 'Error',
        value: failed[0].message ?? 'No message recorded',
        tone: 'neg',
      });
      rows.push({
        label: 'Records that failed',
        value: String(failed.reduce((n, l) => n + l.failed, 0)),
      });
    } else {
      rows.push({
        label: 'Last error',
        value: log.length ? 'None in 14 days' : 'No syncs yet',
        tone: log.length ? 'pos' : 'muted',
      });
    }
    if (
      card.attention.some(
        (a) => a.code === 'auth_failed' || a.code === 'auth_expired',
      )
    ) {
      rows.push({
        label: 'Authorisation',
        value: 'Needs renewing · reconnect',
        tone: 'neg',
      });
    }
    if (conflicts)
      rows.push({
        label: 'Stock conflicts',
        value: `${conflicts} awaiting your decision`,
        tone: 'neg',
      });
    return rows;
  }

  // ── Actions ───────────────────────────────────────────────────────────

  async pause(businessId: string, actorUserId: string, key: string) {
    const def = this.def(key);
    const provider = this.requireIntegrationProvider(def, 'pause');
    if (provider === IntegrationProvider.whatsapp) {
      throw new AppException(
        'INTEGRATION_ACTION_UNSUPPORTED',
        'WhatsApp sends your messages rather than syncing — disconnect it to send from the shared number instead',
        HttpStatus.BAD_REQUEST,
      );
    }
    const row = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider } },
    });
    if (!row || row.status === 'not_connected') {
      throw new AppException(
        'INTEGRATION_NOT_CONNECTED',
        `${def.name} is not connected`,
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.tenantPrisma.client.integration.update({
      where: { businessId_provider: { businessId, provider } },
      data: { pausedAt: new Date() },
    });
    await this.audit.record({
      businessId,
      key: provider,
      action: 'integration.paused',
      actorUserId,
    });
    return { paused: true };
  }

  async resume(businessId: string, actorUserId: string, key: string) {
    const def = this.def(key);
    const provider = this.requireIntegrationProvider(def, 'resume');
    await this.tenantPrisma.client.integration.updateMany({
      where: { businessId, provider },
      data: { pausedAt: null },
    });
    await this.audit.record({
      businessId,
      key: provider,
      action: 'integration.resumed',
      actorUserId,
    });
    return { paused: false };
  }

  async syncNow(businessId: string, actorUserId: string, key: string) {
    const def = this.def(key);
    const provider = this.requireIntegrationProvider(def, 'sync');
    const row = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider } },
    });
    // Automation platforms connect through subscriptions (no Integration row); everything else must be connected and running.
    if (def.connectKind !== 'automation') {
      if (!row || row.status === 'not_connected') {
        throw new AppException(
          'INTEGRATION_NOT_CONNECTED',
          `${def.name} is not connected`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (row.pausedAt) {
        throw new AppException(
          'INTEGRATION_PAUSED',
          `${def.name} is paused — resume it before syncing`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const result = await this.connectionDetail.triggerSync(
      businessId,
      provider,
    );
    await this.audit.record({
      businessId,
      key: provider,
      action: 'integration.sync_requested',
      actorUserId,
    });
    return result;
  }

  private requireIntegrationProvider(
    def: HubProviderDef,
    verb: string,
  ): IntegrationProvider {
    const provider = this.provider(def);
    if (!provider) {
      throw new AppException(
        'INTEGRATION_ACTION_UNSUPPORTED',
        `${def.name} is managed from its own screen — it cannot be ${verb}d here`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return provider;
  }
}
