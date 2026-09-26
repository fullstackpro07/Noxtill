import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TokenCipherService } from '../token-cipher.service';
import { HubStateService } from './hub-state.service';
import { HubAdvisorService } from './hub-advisor.service';
import { HubConnectionService } from './hub-connection.service';
import { HubAccountingService } from './hub-accounting.service';
import { HubEcommerceService } from './hub-ecommerce.service';
import { HubLineageService } from './hub-lineage.service';
import { HubRequestsService } from './hub-requests.service';
import { HubProviderCard } from './hub.types';
import { HUB_CATALOG } from './hub.catalog';
import type { ConnectionDetailService } from '../connection-detail/connection-detail.service';
import type { IntegrationAuditService } from '../integration-audit.service';
import type { AuditService } from '../../common/audit/audit.service';
import {
  IntegrationProvider,
  OrderStatus,
  SocialPlatform,
} from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const ago = (min: number) => new Date(Date.now() - min * 60_000);

describe('Integrations hub read model (redesign)', () => {
  let prisma: PrismaService;
  let businessId: string;
  let cipher: TokenCipherService;
  let state: HubStateService;
  let advisor: HubAdvisorService;
  let connection: HubConnectionService;
  let accounting: HubAccountingService;
  let ecommerce: HubEcommerceService;
  const auditLog = jest.fn();
  const auditRecord = jest.fn();
  const triggerSync = jest.fn();

  const card = (cards: HubProviderCard[], key: string) =>
    cards.find((c) => c.key === key)!;
  const tokensFor = (obj: Record<string, unknown>) =>
    cipher.encrypt(JSON.stringify(obj));

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    cipher = new TokenCipherService(
      new ConfigService({
        INTEGRATIONS_TOKEN_KEY: randomBytes(32).toString('base64'),
      }),
    );
    state = new HubStateService(
      tenantPrisma,
      cipher,
      new ConfigService({ SHOPIFY_CLIENT_ID: 'x', SHOPIFY_CLIENT_SECRET: 'y' }),
    );
    advisor = new HubAdvisorService(tenantPrisma, {
      log: auditLog,
    } as unknown as AuditService);
    connection = new HubConnectionService(
      tenantPrisma,
      state,
      { triggerSync } as unknown as ConnectionDetailService,
      { record: auditRecord } as unknown as IntegrationAuditService,
    );
    accounting = new HubAccountingService(tenantPrisma);
    ecommerce = new HubEcommerceService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Hub Read Model Biz',
        slug: `hub-read-model-${Date.now()}`,
        timezone: 'Asia/Karachi',
        currency: 'PKR',
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.integrationAdvisorDismissal.deleteMany({
      where: { businessId },
    });
    await prisma.integrationRequest.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.ecommerceSyncConflict.deleteMany({ where: { businessId } });
    await prisma.integrationSyncLog.deleteMany({ where: { businessId } });
    await prisma.socialAccount.deleteMany({ where: { businessId } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.accountingMapping.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('every catalog entry has a unique key and maps to a real source', () => {
    const keys = HUB_CATALOG.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of HUB_CATALOG) {
      if (p.source.type === 'integration')
        expect(Object.values(IntegrationProvider)).toContain(p.source.provider);
      if (p.source.type === 'social')
        expect(Object.values(SocialPlatform)).toContain(p.source.platform);
    }
    // Every design provider is present.
    for (const key of [
      'gmb',
      'google_ads',
      'merchant',
      'google_analytics',
      'google_calendar',
      'whatsapp',
      'facebook',
      'instagram',
      'meta_ads',
      'bing_places',
      'microsoft_ads',
      'outlook',
      'linkedin',
      'tiktok',
      'pinterest',
      'twitter',
      'shopify',
      'woocommerce',
      'stripe',
      'paypal',
      'square',
      'quickbooks',
      'xero',
      'mailchimp',
      'klaviyo',
      'zapier',
      'make',
      'n8n',
      'slack',
      'zoom',
      'rest_api',
      'webhooks',
    ]) {
      expect(keys).toContain(key);
    }
  });

  it('a business with nothing connected reads as nothing connected, not as healthy', async () => {
    const cards = await state.cards(businessId);
    expect(
      cards.every(
        (c) =>
          c.status === 'not_connected' ||
          c.key === 'rest_api' ||
          c.key === 'webhooks',
      ),
    ).toBe(true);
    const health = state.health(cards);
    expect(health.connected).toBe(0);
    expect(health.allHealthy).toBe(false);
    expect(health.headline).toBe('No integrations connected');
    expect(await advisor.findings(businessId, cards)).toEqual([]);
  });

  it('marks a platform without its OAuth credentials as setup-required, and one with them as ready', async () => {
    const cards = await state.cards(businessId);
    expect(card(cards, 'shopify').setupRequired).toBe(false); // both env keys configured in this spec
    expect(card(cards, 'stripe').setupRequired).toBe(true);
    expect(card(cards, 'woocommerce').setupRequired).toBe(false); // credential-based: nothing platform-level needed
  });

  it('derives status, last attempted vs last successful, errors today and records from real rows', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: 'quickbooks',
        status: 'connected',
        connectedAt: ago(60 * 24 * 30),
        lastSyncAt: ago(1500),
        tokens: tokensFor({ accessToken: 'a' }),
      },
    });
    await prisma.integrationSyncLog.createMany({
      data: [
        {
          businessId,
          provider: 'quickbooks',
          success: true,
          recordsProcessed: 12,
          createdAt: ago(1500),
        },
        {
          businessId,
          provider: 'quickbooks',
          success: false,
          recordsProcessed: 0,
          recordsFailed: 3,
          message: 'No accounting mapping',
          createdAt: ago(20),
        },
      ],
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        status: OrderStatus.completed,
        total: 10,
        accountingSyncedAt: ago(1500),
        accountingExternalId: 'INV-1',
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 2,
        status: OrderStatus.completed,
        total: 20,
        accountingSyncError: 'No accounting mapping for category "X"',
        accountingSyncAttemptedAt: ago(20),
      },
    });

    const c = card(await state.cards(businessId), 'quickbooks');
    expect(c.status).toBe('needs_attention');
    expect(
      c.lastAttemptAt && new Date(c.lastAttemptAt).getTime(),
    ).toBeGreaterThan(new Date(c.lastSuccessAt!).getTime());
    expect(c.errorsToday).toBe(1);
    expect(c.records).toBe(1); // one order really posted
    expect(c.attention.map((a) => a.code).sort()).toEqual([
      'records_failed',
      'sync_failing',
    ]);
  });

  it('a token that cannot renew itself is flagged before it lapses, and once it has lapsed', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: 'meta_ads',
        status: 'connected',
        tokens: tokensFor({
          accessToken: 'a',
          expiresAt: new Date(Date.now() + 6 * 86_400_000).toISOString(),
        }),
      },
    });
    let c = card(await state.cards(businessId), 'meta_ads');
    expect(c.token.state).toBe('expiring');
    expect(c.token.label).toBe('Token expires in 6 days');
    expect(c.status).toBe('needs_attention');

    await prisma.integration.update({
      where: { businessId_provider: { businessId, provider: 'meta_ads' } },
      data: {
        tokens: tokensFor({
          accessToken: 'a',
          expiresAt: ago(60 * 24).toISOString(),
        }),
      },
    });
    c = card(await state.cards(businessId), 'meta_ads');
    expect(c.token.state).toBe('expired');
    expect(c.attention[0].code).toBe('auth_expired');
  });

  it('an access token that has a refresh token is not a problem when it expires', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: 'google_calendar',
        status: 'connected',
        tokens: tokensFor({
          accessToken: 'a',
          refreshToken: 'r',
          expiresAt: ago(5).toISOString(),
        }),
      },
    });
    const c = card(await state.cards(businessId), 'google_calendar');
    expect(c.token.state).toBe('valid');
    expect(c.status).toBe('connected');
  });

  it('paused is reported as paused (not an error), and social accounts feed their own cards', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: 'mailchimp',
        status: 'connected',
        pausedAt: ago(100),
        tokens: tokensFor({ accessToken: 'a' }),
      },
    });
    await prisma.socialAccount.create({
      data: {
        businessId,
        platform: 'instagram',
        status: 'needs_attention',
        tokens: tokensFor({
          accessToken: 'a',
          expiresAt: ago(2880).toISOString(),
        }),
      },
    });
    await prisma.socialAccount.create({
      data: {
        businessId,
        platform: 'facebook',
        status: 'connected',
        tokens: tokensFor({ accessToken: 'a' }),
        externalAccountName: 'Salon',
      },
    });

    const cards = await state.cards(businessId);
    expect(card(cards, 'mailchimp').status).toBe('paused');
    expect(card(cards, 'instagram').status).toBe('needs_attention');
    expect(card(cards, 'facebook')).toMatchObject({
      status: 'connected',
      externalAccountName: 'Salon',
    });
    const health = state.health(cards);
    expect(health.paused).toBe(1);
    expect(health.headline).toMatch(/need.* attention/);
  });

  it('the Advisor reports each finding from live state, ranked by severity, and a dismissal hides it only for a while', async () => {
    const cards = await state.cards(businessId);
    const findings = await advisor.findings(businessId, cards);
    const severities = findings.map((f) => f.severity);
    expect(
      [...severities].sort(
        (a, b) =>
          ['critical', 'high', 'medium'].indexOf(a) -
          ['critical', 'high', 'medium'].indexOf(b),
      ),
    ).toEqual(severities);
    const instagram = findings.find((f) => f.key === 'auth_expired:instagram');
    expect(instagram).toMatchObject({
      severity: 'critical',
      primaryAction: { kind: 'reconnect' },
    });
    expect(
      findings.find((f) => f.key === 'records_failed:quickbooks')?.why,
    ).toContain('No accounting mapping');

    await advisor.dismiss(businessId, undefined, 'auth_expired:instagram');
    expect(
      (await advisor.findings(businessId, cards)).some(
        (f) => f.key === 'auth_expired:instagram',
      ),
    ).toBe(false);

    // The dismissal lapses: the finding returns while the condition still holds.
    await prisma.integrationAdvisorDismissal.update({
      where: {
        businessId_findingKey: {
          businessId,
          findingKey: 'auth_expired:instagram',
        },
      },
      data: { until: ago(1) },
    });
    expect(
      (await advisor.findings(businessId, cards)).some(
        (f) => f.key === 'auth_expired:instagram',
      ),
    ).toBe(true);
  });

  it('connection detail builds every section from real logs and audit, and says "Not tracked" for what it does not measure', async () => {
    await prisma.auditLog.create({
      data: {
        businessId,
        entity: 'Integration',
        entityId: 'quickbooks',
        action: 'integration.connected',
        createdAt: ago(100),
      },
    });
    const d = await connection.detail(businessId, 'quickbooks');
    expect(d.card.key).toBe('quickbooks');
    expect(d.overview.find((r) => r.label === 'Status')?.value).toBe(
      'Needs attention',
    );
    expect(
      d.health.find((r) => r.label === 'Attempted and successful differ')
        ?.value,
    ).toContain('Yes');
    expect(d.health.find((r) => r.label === 'Provider status')?.value).toBe(
      'Not tracked',
    );
    expect(d.activity.find((r) => r.label === 'Failed syncs')?.value).toBe('1');
    expect(d.syncLog[0].success).toBe(false);
    expect(d.errors.log).toHaveLength(1);
    expect(d.errors.rows.find((r) => r.label === 'Error')?.value).toBe(
      'No accounting mapping',
    );
    expect(d.fieldMapping.editor).toBe('accounting');
    expect(d.audit[0].action).toBe('Connected');
  });

  it('pause stops the connection from syncing and resume restores it, each audited; social cannot be paused here', async () => {
    await connection.pause(businessId, 'user-1', 'quickbooks');
    expect(card(await state.cards(businessId), 'quickbooks').status).toBe(
      'paused',
    );
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'quickbooks',
        action: 'integration.paused',
        actorUserId: 'user-1',
      }),
    );
    await connection.resume(businessId, 'user-1', 'quickbooks');
    expect(card(await state.cards(businessId), 'quickbooks').status).not.toBe(
      'paused',
    );
    await expect(
      connection.pause(businessId, 'user-1', 'facebook'),
    ).rejects.toMatchObject({
      response: { code: 'INTEGRATION_ACTION_UNSUPPORTED' },
    });
    await expect(
      connection.pause(businessId, 'user-1', 'not-a-provider'),
    ).rejects.toMatchObject({ response: { code: 'INTEGRATION_UNKNOWN' } });
    await expect(
      connection.pause(businessId, 'user-1', 'xero'),
    ).rejects.toMatchObject({
      response: { code: 'INTEGRATION_NOT_CONNECTED' },
    });
  });

  it('accounting overview counts posted, pending and failed orders and finds categories that block posting', async () => {
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Widget',
        category: 'Gadgets',
        sellingPrice: 5,
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 3,
        status: OrderStatus.completed,
        total: 5,
        items: {
          create: [
            {
              productId: product.id,
              name: 'Widget',
              price: 5,
              cost: 1,
              qty: 1,
            },
          ],
        },
      },
    });
    const o = await accounting.overview(businessId);
    expect(o.provider).toBe('quickbooks');
    expect(o.kpis.postedTotal).toBe(1);
    expect(o.kpis.failed).toBe(1);
    expect(o.kpis.pending).toBe(1);
    expect(o.bars).toHaveLength(14);
    expect(o.mapping.hasDefault).toBe(false);
    expect(o.mapping.blocked).toEqual([{ category: 'Gadgets', orders: 1 }]);

    await prisma.accountingMapping.create({
      data: {
        businessId,
        provider: 'quickbooks',
        externalAccountCode: 'ACC-DEFAULT',
      },
    });
    const mapped = await accounting.overview(businessId);
    expect(mapped.mapping.hasDefault).toBe(true);
    expect(mapped.mapping.blocked).toEqual([]);
  });

  it('accounting transactions carry the status, the failure reason and the resolved ledger account', async () => {
    const all = await accounting.transactions(businessId);
    expect(all.map((t) => t.status).sort()).toEqual([
      'failed',
      'pending',
      'posted',
    ]);
    expect(all.find((t) => t.status === 'failed')?.error).toContain(
      'No accounting mapping',
    );
    expect(all.find((t) => t.status === 'posted')?.externalId).toBe('INV-1');
    const gadgets = all.find((t) =>
      t.lines.some((l) => l.category === 'Gadgets'),
    )!;
    expect(gadgets.ledgerAccounts).toEqual(['ACC-DEFAULT']);
    expect(
      (await accounting.transactions(businessId, 'failed')).every(
        (t) => t.status === 'failed',
      ),
    ).toBe(true);
  });

  it('e-commerce overview reports source of truth, pending conflicts and 8 weekly channel bars', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: 'shopify',
        status: 'connected',
        tokens: tokensFor({ accessToken: 'a' }),
        meta: { sourceOfTruth: 'manual' },
      },
    });
    await prisma.ecommerceSyncConflict.create({
      data: {
        businessId,
        provider: 'shopify',
        sku: 'SKU-1',
        winner: 'none',
        localQty: 5,
        remoteQty: 3,
        status: 'pending',
        productName: 'Widget',
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 4,
        status: OrderStatus.completed,
        total: 9,
        orderType: 'online',
        externalProvider: 'shopify',
        externalId: 'ext-1',
      },
    });

    const o = await ecommerce.overview(businessId);
    expect(o.connections[0]).toMatchObject({
      provider: 'shopify',
      sourceOfTruth: 'manual',
      pendingConflicts: 1,
      paused: false,
    });
    expect(o.kpis.pendingConflicts).toBe(1);
    expect(o.kpis.ordersImportedTotal).toBe(1);
    expect(o.channelBars).toHaveLength(8);
    expect(o.channelBars.reduce((n, b) => n + b.online, 0)).toBe(1);

    const items = await ecommerce.items(businessId);
    expect(items.orders[0]).toMatchObject({
      storeRef: 'ext-1',
      provider: 'shopify',
    });
    expect(items.conflicts[0]).toMatchObject({
      sku: 'SKU-1',
      status: 'pending',
      localQty: 5,
      remoteQty: 3,
    });

    const shopify = card(await state.cards(businessId), 'shopify');
    expect(shopify.attention.map((a) => a.code)).toContain('conflicts_pending');
  });

  it('the Business map derives each chain’s health from live connections', async () => {
    const chains = new HubLineageService().chains(
      await state.cards(businessId),
    );
    expect(chains.find((c) => c.key === 'ecommerce')?.health).toMatchObject({
      state: 'attention',
    });
    expect(chains.find((c) => c.key === 'directories')?.health).toEqual({
      state: 'not_connected',
      label: 'Not connected',
    });
    for (const chain of chains)
      expect(chain.nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('a request for an integration is counted per provider across businesses', async () => {
    const service = new HubRequestsService(prisma, {
      log: auditLog,
    } as unknown as AuditService);
    const suffix = Date.now();
    const name = `Calendly ${suffix}`;
    const key = `calendly-${suffix}`;
    const first = await service.create(
      businessId,
      undefined,
      'owner@example.com',
      {
        providerName: ` ${name} `,
        useCase: 'Sync my booking links',
        direction: 'Two-way',
      },
    );
    expect(first).toEqual({ providerKey: key, businessesRequesting: 1 });
    const second = await service.create(businessId, undefined, undefined, {
      providerName: name.toLowerCase(),
      useCase: 'Again, from the same business',
      direction: 'Inbound',
    });
    expect(second.businessesRequesting).toBe(1); // the same business asking twice is still one business
    const stored = await prisma.integrationRequest.findFirstOrThrow({
      where: { businessId, providerKey: key },
      orderBy: { createdAt: 'asc' },
    });
    expect(stored).toMatchObject({
      providerName: name,
      contactEmail: 'owner@example.com',
    });
  });

  it('Sync now refuses a paused or unconnected integration instead of pretending to run', async () => {
    await connection.pause(businessId, 'user-1', 'quickbooks');
    await expect(
      connection.syncNow(businessId, 'user-1', 'quickbooks'),
    ).rejects.toMatchObject({ response: { code: 'INTEGRATION_PAUSED' } });
    await connection.resume(businessId, 'user-1', 'quickbooks');
    await expect(
      connection.syncNow(businessId, 'user-1', 'xero'),
    ).rejects.toMatchObject({
      response: { code: 'INTEGRATION_NOT_CONNECTED' },
    });
    expect(triggerSync).not.toHaveBeenCalled();
  });

  it('Sync now goes through the generic per-provider sync and is audited', async () => {
    triggerSync.mockResolvedValue({ pushed: 1 });
    await connection.syncNow(businessId, 'user-1', 'quickbooks');
    expect(triggerSync).toHaveBeenCalledWith(businessId, 'quickbooks');
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'integration.sync_requested' }),
    );
  });
});
