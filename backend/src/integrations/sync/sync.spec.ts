import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TokenCipherService } from '../token-cipher.service';
import { SyncLogService } from './sync-log.service';
import { CapabilitySyncService } from './capability-sync.service';
import { BookingSyncService } from './booking-sync.service';
import { SlackNotifierService } from '../automation/slack-notifier.service';
import { SlackConnector } from '../connectors/slack.connector';
import type { IntegrationsService } from '../integrations.service';
import type { ConnectorRegistry } from '../connector-registry';
import type { S3Service } from '../../common/storage/s3.service';
import {
  AppointmentStatus,
  IntegrationProvider,
  WorkflowTriggerKey,
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

describe('Capability sync, booking sync and Slack notifier (Integrations redesign)', () => {
  let prisma: PrismaService;
  let businessId: string;
  let capability: CapabilitySyncService;
  let bookings: BookingSyncService;
  let cipher: TokenCipherService;
  const connectors: Record<string, Record<string, jest.Mock>> = {};
  const getTokens = jest.fn().mockResolvedValue({ accessToken: 'tok' });
  const runs = () => new SyncLogService(prisma);

  const connect = (
    provider: IntegrationProvider,
    extra: Record<string, unknown> = {},
  ) =>
    prisma.integration.upsert({
      where: { businessId_provider: { businessId, provider } },
      create: { businessId, provider, status: 'connected', ...extra },
      update: { status: 'connected', pausedAt: null, ...extra },
    });
  const lastLog = (provider: IntegrationProvider) =>
    prisma.integrationSyncLog.findFirstOrThrow({
      where: { businessId, provider },
      orderBy: { createdAt: 'desc' },
    });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cipher = new TokenCipherService(
      new ConfigService({
        INTEGRATIONS_TOKEN_KEY: randomBytes(32).toString('base64'),
      }),
    );
    const registry = {
      get: (p: string) => connectors[p],
    } as unknown as ConnectorRegistry;
    capability = new CapabilitySyncService(
      prisma,
      { getTokens } as unknown as IntegrationsService,
      registry,
      runs(),
      {
        getSignedDownloadUrl: jest
          .fn()
          .mockResolvedValue('https://signed/img.png'),
      } as unknown as S3Service,
    );
    bookings = new BookingSyncService(
      prisma,
      { getTokens } as unknown as IntegrationsService,
      registry,
      runs(),
    );

    const cls = new FakeClsService();
    new TenantPrismaService(prisma, cls as unknown as ClsService);
    const business = await prisma.business.create({
      data: {
        name: 'Capability Sync Biz',
        slug: `capability-sync-${Date.now()}`,
        currency: 'PKR',
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  beforeEach(() => {
    for (const k of Object.keys(connectors)) delete connectors[k];
    getTokens.mockResolvedValue({ accessToken: 'tok' });
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.productFeedItem.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.masterListing.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.externalPayment.deleteMany({ where: { businessId } });
    await prisma.webTrafficDaily.deleteMany({ where: { businessId } });
    await prisma.integrationSyncLog.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  describe('payments', () => {
    const payment = (id: string, amount: number) => ({
      externalId: id,
      kind: 'charge',
      status: 'succeeded',
      amount,
      currency: 'USD',
      occurredAt: '2026-09-01T10:00:00.000Z',
    });

    it('stores what the processor returned, is idempotent, and logs the run', async () => {
      await connect('stripe');
      connectors.stripe = {
        fetchPayments: jest
          .fn()
          .mockResolvedValue([payment('ch_1', 12.5), payment('ch_2', 30)]),
      };
      const first = await capability.syncPayments(businessId, 'stripe');
      expect(first).toMatchObject({ processed: 2, failed: 0 });
      expect(
        await prisma.externalPayment.count({
          where: { businessId, provider: 'stripe' },
        }),
      ).toBe(2);

      const second = await capability.syncPayments(businessId, 'stripe');
      expect(second.processed).toBe(0); // the same two rows are not stored twice
      expect(
        await prisma.externalPayment.count({
          where: { businessId, provider: 'stripe' },
        }),
      ).toBe(2);
      expect((await lastLog('stripe')).success).toBe(true);
      expect(
        (
          await prisma.integration.findUniqueOrThrow({
            where: { businessId_provider: { businessId, provider: 'stripe' } },
          })
        ).lastSyncAt,
      ).not.toBeNull();
    });

    it('records a provider failure as a failed run — never as a success — and keeps the reason', async () => {
      connectors.stripe = {
        fetchPayments: jest
          .fn()
          .mockRejectedValue(new Error('401 unauthorized')),
      };
      const result = await capability.syncPayments(businessId, 'stripe');
      expect(result).toMatchObject({
        processed: 0,
        failed: 1,
        message: '401 unauthorized',
      });
      expect(await lastLog('stripe')).toMatchObject({
        success: false,
        message: '401 unauthorized',
      });
    });

    it('refuses to run while paused or not connected', async () => {
      await prisma.integration.update({
        where: { businessId_provider: { businessId, provider: 'stripe' } },
        data: { pausedAt: new Date() },
      });
      await expect(
        capability.syncPayments(businessId, 'stripe'),
      ).rejects.toMatchObject({ response: { code: 'INTEGRATION_PAUSED' } });
      await expect(
        capability.syncPayments(businessId, 'square'),
      ).rejects.toMatchObject({
        response: { code: 'INTEGRATION_NOT_CONNECTED' },
      });
    });
  });

  it('imports daily analytics traffic and updates a day that was already stored', async () => {
    await connect('google_analytics');
    connectors.google_analytics = {
      fetchTraffic: jest
        .fn()
        .mockResolvedValue([
          { day: '2026-09-25', sessions: 100, conversions: 4 },
        ]),
    };
    await capability.syncAnalytics(businessId);
    connectors.google_analytics = {
      fetchTraffic: jest.fn().mockResolvedValue([
        { day: '2026-09-25', sessions: 140, conversions: 6 },
        { day: '2026-09-26', sessions: 90, conversions: 2 },
      ]),
    };
    const result = await capability.syncAnalytics(businessId);
    expect(result.processed).toBe(2);
    const rows = await prisma.webTrafficDaily.findMany({
      where: { businessId },
      orderBy: { day: 'asc' },
    });
    expect(rows.map((r) => [r.sessions, r.conversions])).toEqual([
      [140, 6],
      [90, 2],
    ]);
  });

  it('sends only customers who consented, have not opted out and are active to the audience', async () => {
    await connect('mailchimp');
    const c = (name: string, extra: Record<string, unknown>) =>
      prisma.customer.create({
        data: {
          businessId,
          name,
          phone: `+92${Math.floor(Math.random() * 1e9)}`,
          ...extra,
        },
      });
    await c('Sam Consenting', { email: 'sam@x.com' });
    await c('Opt Out', { email: 'out@x.com', optedOut: true });
    await c('No Consent', { email: 'no@x.com', consentMarketing: false });
    await c('Archived Person', { email: 'arch@x.com', status: 'archived' });
    await c('No Email', {});
    const pushContacts = jest.fn().mockResolvedValue({ pushed: 1, failed: 0 });
    connectors.mailchimp = { pushContacts };
    const result = await capability.syncAudience(businessId, 'mailchimp');
    expect(result.processed).toBe(1);
    const [, , sent] = pushContacts.mock.calls[0] as [
      unknown,
      unknown,
      Array<{ email: string; firstName: string; lastName?: string }>,
    ];
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      email: 'sam@x.com',
      firstName: 'Sam',
      lastName: 'Consenting',
    });
  });

  it('Merchant Center needs a website link, then publishes active products and records each product’s outcome', async () => {
    await connect('merchant');
    await prisma.product.create({
      data: {
        businessId,
        name: 'Shampoo',
        sku: 'SHP-1',
        sellingPrice: 15,
        stockQty: 4,
        photoKey: 'p/a.png',
      },
    });
    await prisma.product.create({
      data: {
        businessId,
        name: 'Broken',
        sku: 'BRK-1',
        sellingPrice: 5,
        stockQty: 0,
      },
    });
    connectors.merchant = { pushProducts: jest.fn() };
    const noSite = await capability.syncMerchant(businessId);
    expect(noSite.message).toContain('Add your website');
    expect(connectors.merchant.pushProducts).not.toHaveBeenCalled();

    await prisma.masterListing.create({
      data: {
        businessId,
        name: 'Olivia Salon',
        website: 'https://olivia.example.com',
        categories: [],
        hours: {},
      },
    });
    connectors.merchant.pushProducts.mockResolvedValue({
      pushed: 1,
      failed: 1,
      errors: ['BRK-1: Missing image'],
    });
    const result = await capability.syncMerchant(businessId);
    expect(result).toMatchObject({ processed: 1, failed: 1 });
    const [, , sent] = connectors.merchant.pushProducts.mock.calls[0] as [
      unknown,
      unknown,
      Array<{
        sku: string;
        link: string;
        currency: string;
        imageLink?: string;
        inStock: boolean;
      }>,
    ];
    expect(sent.find((p) => p.sku === 'SHP-1')).toMatchObject({
      link: 'https://olivia.example.com',
      currency: 'PKR',
      imageLink: 'https://signed/img.png',
      inStock: true,
    });
    const feed = await prisma.productFeedItem.findMany({
      where: { businessId },
    });
    expect(feed.map((f) => f.syncState).sort()).toEqual(['error', 'synced']);
  });

  describe('booking calendars and meetings', () => {
    let service: { id: string };
    let customer: { id: string };
    const booking = (startHour: number, status: AppointmentStatus = 'booked') =>
      prisma.appointment.create({
        data: {
          businessId,
          serviceId: service.id,
          customerId: customer.id,
          startsAt: new Date(Date.now() + startHour * 3_600_000),
          endsAt: new Date(Date.now() + (startHour + 1) * 3_600_000),
          status,
        },
      });

    beforeAll(async () => {
      service = await prisma.product.create({
        data: {
          businessId,
          name: 'Consultation',
          kind: 'service',
          sellingPrice: 50,
          durationMin: 60,
        },
      });
      customer = await prisma.customer.create({
        data: { businessId, name: 'Booking Customer', phone: '+920000000001' },
      });
    });

    it('creates one calendar event per booking, updates it when the booking moves and removes it when cancelled', async () => {
      await connect('google_calendar');
      const create = jest.fn().mockResolvedValue({ externalId: 'evt-1' });
      const update = jest.fn().mockResolvedValue(undefined);
      const del = jest.fn().mockResolvedValue(undefined);
      connectors.google_calendar = {
        createCalendarEvent: create,
        updateCalendarEvent: update,
        deleteCalendarEvent: del,
      };

      const appt = await booking(5);
      let result = await bookings.sync(businessId, 'google_calendar');
      expect(result).toMatchObject({ created: 1, updated: 0, removed: 0 });
      // Privacy: the event carries the service and customer name, never a phone number or email.
      const [, , eventInput] = create.mock.calls[0] as [
        unknown,
        unknown,
        Record<string, unknown>,
      ];
      expect(eventInput).toMatchObject({
        title: 'Consultation — Booking Customer',
      });
      expect(JSON.stringify(eventInput)).not.toContain('+92');

      // Nothing changed → nothing is sent again.
      result = await bookings.sync(businessId, 'google_calendar');
      expect(create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ created: 0, updated: 0 });

      await prisma.appointment.update({
        where: { id: appt.id },
        data: {
          startsAt: new Date(Date.now() + 8 * 3_600_000),
          endsAt: new Date(Date.now() + 9 * 3_600_000),
        },
      });
      result = await bookings.sync(businessId, 'google_calendar');
      expect(result.updated).toBe(1);
      expect(update).toHaveBeenCalledWith(
        { accessToken: 'tok' },
        expect.anything(),
        'evt-1',
        expect.objectContaining({ title: 'Consultation — Booking Customer' }),
      );

      await prisma.appointment.update({
        where: { id: appt.id },
        data: { status: 'cancelled' },
      });
      result = await bookings.sync(businessId, 'google_calendar');
      expect(result.removed).toBe(1);
      expect(del).toHaveBeenCalledWith(
        { accessToken: 'tok' },
        expect.anything(),
        'evt-1',
      );
      expect(
        (await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } }))
          .calendarEventIds,
      ).toBeNull();
    });

    it('creates a Zoom meeting once per booking and stores its join link', async () => {
      await connect('zoom');
      const createMeeting = jest.fn().mockResolvedValue({
        externalId: '99',
        joinUrl: 'https://zoom.us/j/99',
      });
      connectors.zoom = { createMeeting };
      const appt = await booking(30);
      await bookings.sync(businessId, 'zoom');
      await bookings.sync(businessId, 'zoom');
      expect(createMeeting).toHaveBeenCalledTimes(1); // the second run finds the meeting already created
      expect(
        (await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } }))
          .meetingUrl,
      ).toBe('https://zoom.us/j/99');
    });

    it('a failed event is counted and logged with its reason, and never aborts the other bookings', async () => {
      await connect('outlook');
      const create = jest
        .fn()
        .mockRejectedValueOnce(new Error('403 forbidden'))
        .mockResolvedValue({ externalId: 'ok' });
      connectors.outlook = { createCalendarEvent: create };
      await booking(50);
      await booking(51);
      const result = await bookings.sync(businessId, 'outlook');
      expect(result.failed).toBe(1);
      expect(result.created).toBeGreaterThanOrEqual(1);
      const log = await lastLog('outlook');
      expect(log.success).toBe(false);
      expect(log.message).toContain('403 forbidden');
    });

    it('a paused connection is skipped by the schedule and refused by "Sync now"', async () => {
      await prisma.integration.update({
        where: { businessId_provider: { businessId, provider: 'outlook' } },
        data: { pausedAt: new Date() },
      });
      const create = jest.fn();
      connectors.outlook = { createCalendarEvent: create };
      await booking(70);
      expect(
        await bookings.sync(businessId, 'outlook', { quiet: true }),
      ).toMatchObject({ created: 0, failed: 0 });
      expect(create).not.toHaveBeenCalled();
      await expect(
        bookings.sync(businessId, 'outlook', { manual: true }),
      ).rejects.toMatchObject({ response: { code: 'INTEGRATION_PAUSED' } });
    });
  });

  describe('Slack notifier', () => {
    const post = jest.fn();
    const makeNotifier = () => {
      const notifier = new SlackNotifierService(prisma, cipher, {
        postMessage: post,
      } as unknown as SlackConnector);
      return notifier;
    };
    const connectSlack = (extra: Record<string, unknown> = {}) =>
      connect('slack', {
        tokens: cipher.encrypt(
          JSON.stringify({
            accessToken: 'x',
            providerMeta: {
              webhookUrl: 'https://hooks.slack.com/services/T/B/X',
            },
          }),
        ),
        ...extra,
      });

    it('posts a real event to the connected channel and logs it', async () => {
      await connectSlack();
      post.mockResolvedValue(undefined);
      await makeNotifier().notify(businessId, WorkflowTriggerKey.sale, {
        description: 'Sale #1042 — 45.00',
      });
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'x' }),
        expect.anything(),
        '*New sale* — Sale #1042 — 45.00',
      );
      expect(await lastLog('slack')).toMatchObject({
        success: true,
        recordsProcessed: 1,
      });
    });

    it('a Slack outage is logged as a failure and never thrown into the sale that triggered it', async () => {
      post.mockRejectedValue(new Error('channel_not_found'));
      await expect(
        makeNotifier().notify(businessId, WorkflowTriggerKey.low_stock, {
          description: 'Blue T-Shirt is low',
        }),
      ).resolves.toBeUndefined();
      expect(await lastLog('slack')).toMatchObject({
        success: false,
        message: 'channel_not_found',
      });
    });

    it('does nothing when Slack is paused or not connected', async () => {
      post.mockClear();
      await connectSlack({ pausedAt: new Date() });
      await makeNotifier().notify(businessId, WorkflowTriggerKey.sale, {
        description: 'x',
      });
      await prisma.integration.delete({
        where: { businessId_provider: { businessId, provider: 'slack' } },
      });
      await makeNotifier().notify(businessId, WorkflowTriggerKey.sale, {
        description: 'x',
      });
      expect(post).not.toHaveBeenCalled();
    });
  });
});
