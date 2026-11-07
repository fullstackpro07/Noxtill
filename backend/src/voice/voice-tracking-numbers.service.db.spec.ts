import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PhoneCallStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import {
  resolveTrackingLine,
  VoiceTrackingNumbersService,
} from './voice-tracking-numbers.service';
import { VoiceTrackingService } from './voice-tracking.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

class FakeClsService {
  private readonly store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const unique = String(Date.now()).slice(-4);
const OWNED = `+1628201${unique}`;
const PURCHASED = `+1628202${unique}`;

describe('VoiceTrackingNumbersService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceTrackingNumbersService;
  let tracking: VoiceTrackingService;
  let businessId: string;
  let userId: string;
  let campaignId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const audit = new AuditService(tenant, cls as unknown as ClsService);
    const config = {
      get: (key: string) =>
        ({
          TWILIO_ACCOUNT_SID: 'AC_test',
          TWILIO_AUTH_TOKEN: 'token',
          BACKEND_URL: 'https://api.example.com/api/v1',
        })[key],
    } as unknown as ConfigService;
    service = new VoiceTrackingNumbersService(tenant, prisma, audit, config);
    tracking = new VoiceTrackingService(tenant);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    businessId = (
      await prisma.business.create({
        data: { name: 'Tracking Numbers Test', slug: `voice-trk-${suffix}` },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          email: `voice-trk-${suffix}@example.com`,
          passwordHash: 'x',
          name: 'Tracking Owner',
        },
      })
    ).id;
    campaignId = (
      await prisma.adCampaign.create({
        data: {
          businessId,
          provider: 'google_ads',
          goal: 'Spring calls',
          budget: new Prisma.Decimal('50.00'),
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        await tx.voiceTrackingNumber.deleteMany({ where: { businessId } });
        if (businessId) await tx.business.delete({ where: { id: businessId } });
        if (userId) await tx.user.delete({ where: { id: userId } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
      await prisma.$disconnect();
    }
  });

  beforeEach(() => {
    mockedAxios.get.mockReset();
    mockedAxios.post.mockReset();
  });

  async function expectAppError(promise: Promise<unknown>, code: string) {
    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppException);
    expect((caught as AppException).getResponse()).toMatchObject({ code });
  }

  it('connects only a number the Twilio account owns, and rejects duplicates', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { incoming_phone_numbers: [] },
    });
    await expectAppError(
      service.add(businessId, userId, {
        mode: 'connect',
        phoneNumber: OWNED,
        label: 'Flyer line',
        source: 'print',
        channel: 'offline',
      }),
      'VOICE_TRACKING_NUMBER_NOT_OWNED',
    );
    expect(
      await prisma.voiceTrackingNumber.count({ where: { businessId } }),
    ).toBe(0);

    mockedAxios.get.mockResolvedValueOnce({
      data: {
        incoming_phone_numbers: [{ sid: 'PN_owned', phone_number: OWNED }],
      },
    });
    mockedAxios.post.mockResolvedValueOnce({ data: {} });
    const added = await service.add(businessId, userId, {
      mode: 'connect',
      phoneNumber: OWNED,
      label: 'Google Ads line',
      source: 'google_ads',
      channel: 'paid_search',
      campaignId,
    });
    expect(added).toMatchObject({
      phoneNumber: OWNED,
      provisionedVia: 'connected',
    });

    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toContain('/IncomingPhoneNumbers/PN_owned.json');
    expect((body as URLSearchParams).get('VoiceUrl')).toBe(
      'https://api.example.com/api/v1/voice/webhook/incoming',
    );

    await expectAppError(
      service.add(businessId, userId, {
        mode: 'connect',
        phoneNumber: OWNED,
        label: 'Duplicate',
        source: 'x_source',
        channel: 'x_channel',
      }),
      'VOICE_TRACKING_NUMBER_IN_USE',
    );
  });

  it('purchases a number and attributes inbound calls by the number dialed, keeping history on reassignment', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { available_phone_numbers: [{ phone_number: PURCHASED }] },
    });
    mockedAxios.post.mockResolvedValueOnce({
      data: { sid: 'PN_bought', phone_number: PURCHASED },
    });
    const bought = await service.add(businessId, userId, {
      mode: 'purchase',
      areaCode: '628',
      label: 'Website line',
      source: 'website',
      channel: 'organic',
    });
    expect(bought.provisionedVia).toBe('purchased');

    const first = await resolveTrackingLine(prisma, PURCHASED);
    expect(first).toMatchObject({
      businessId,
      callData: {
        trackingNumberId: bought.id,
        attributionSource: 'website',
        attributionChannel: 'organic',
      },
    });
    const earlyCall = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-trk-1-${unique}`,
        fromNumber: '+14155550111',
        status: PhoneCallStatus.completed,
        transcript: [],
        ...first!.callData,
      },
    });
    await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-trk-2-${unique}`,
        fromNumber: '+14155550112',
        status: PhoneCallStatus.completed,
        transcript: [],
      },
    });

    await service.assign(businessId, userId, bought.id, {
      source: 'newsletter',
      channel: 'email',
      reason: 'Moved the number to the newsletter footer',
    });
    expect(
      (await resolveTrackingLine(prisma, PURCHASED))?.callData,
    ).toMatchObject({
      attributionSource: 'newsletter',
    });
    const stored = await prisma.phoneCall.findUniqueOrThrow({
      where: { id: earlyCall.id },
    });
    expect(stored.attributionSource).toBe('website');

    const listed = (await service.list(businessId)).find(
      (row) => row.id === bought.id,
    );
    expect(listed?.callsLast30Days).toBe(1);
    expect(listed?.assignments).toHaveLength(2);
    expect(
      listed?.assignments.filter((row) => row.validTo === null),
    ).toHaveLength(1);

    const overview = await tracking.overview(businessId, '30');
    expect(overview.metrics).toMatchObject({
      inboundCalls: 2,
      trackingNumberCalls: 1,
      manualAttributedCalls: 0,
      unknownSourceRate: 0.5,
    });
    const attributed = overview.calls.find((call) => call.id === earlyCall.id);
    expect(attributed?.marketingAttribution?.confidence).toBe(
      'Dialed tracking number (provider-routed)',
    );

    await service.deactivate(businessId, userId, bought.id, {
      reason: 'Campaign finished for the season',
    });
    const inactive = await resolveTrackingLine(prisma, PURCHASED);
    expect(inactive?.businessId).toBe(businessId);
    expect(inactive?.callData).toEqual({ trackingNumberId: bought.id });
  });
});
