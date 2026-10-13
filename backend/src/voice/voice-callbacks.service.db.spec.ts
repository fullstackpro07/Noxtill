import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PhoneCallStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { VoiceComplianceService } from './voice-compliance.service';
import { VoiceCallbacksService } from './voice-callbacks.service';

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

const AGENT_PHONE = '+14155550192';

describe('VoiceCallbacksService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceCallbacksService;
  let businessId: string;
  let userId: string;
  const config: Record<string, string | undefined> = {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    BACKEND_URL: 'https://api.example.com/api/v1',
  };
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const audit = new AuditService(tenant, cls as unknown as ClsService);
    const compliance = new VoiceComplianceService(tenant, audit);
    service = new VoiceCallbacksService(tenant, prisma, compliance, audit, {
      get: (key: string) => config[key],
    } as unknown as ConfigService);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    businessId = (
      await prisma.business.create({
        data: { name: 'Callback Test', slug: `voice-callback-${suffix}` },
      })
    ).id;
    await prisma.phoneNumber.create({
      data: {
        businessId,
        twilioSid: `PN${suffix}`,
        phoneNumber: `+1415203${String(Date.now()).slice(-4)}`,
      },
    });
    userId = (
      await prisma.user.create({
        data: {
          email: `voice-callback-${suffix}@example.com`,
          passwordHash: 'x',
          name: 'Callback Agent',
          phone: AGENT_PHONE,
        },
      })
    ).id;
    const staff = await prisma.businessUser.create({
      data: { businessId, userId, role: Role.staff },
    });
    await prisma.voiceHumanAgentProfile.create({
      data: { businessId, staffUserId: staff.id, active: true },
    });
    const pack = await prisma.voiceCompliancePolicyPack.create({
      data: {
        businessId,
        countryCode: 'US',
        purpose: 'callback',
        callerType: 'live_agent',
      },
    });
    await prisma.voiceCompliancePolicyVersion.create({
      data: {
        businessId,
        packId: pack.id,
        version: 1,
        aiDisclosureText: 'Live agent callback.',
        status: 'published',
        publishedAt: new Date(),
      },
    });
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        if (businessId) await tx.business.delete({ where: { id: businessId } });
        if (userId) await tx.user.delete({ where: { id: userId } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
      await prisma.$disconnect();
    }
  });

  beforeEach(() => {
    mockedAxios.post.mockReset();
    mockedAxios.post.mockImplementation(() =>
      Promise.resolve({ data: { sid: `CA${Date.now()}${(seq += 1)}` } }),
    );
  });

  function missedCall(fromNumber: string) {
    return prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-missed-${Date.now()}-${(seq += 1)}`,
        fromNumber,
        status: PhoneCallStatus.missed,
        transcript: [],
      },
    });
  }

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

  it('blocks without consent, then rings the agent first once staff confirm the callback request', async () => {
    const call = await missedCall('+14155550151');
    const blocked = await service.place(businessId, userId, call.id, {});
    expect(blocked).toMatchObject({
      eligible: false,
      placed: false,
      reasonCode: 'consent_missing',
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).not.toHaveBeenCalled();

    const placed = await service.place(businessId, userId, call.id, {
      callerRequestedCallback: true,
    });
    expect(placed).toMatchObject({ eligible: true, placed: true });
    const consent = await prisma.voiceConsentEvidence.findFirstOrThrow({
      where: { businessId, evidenceReference: `phone_call:${call.id}` },
    });
    expect(consent).toMatchObject({
      source: 'missed_call',
      purpose: 'callback',
    });

    const body = mockedAxios.post.mock.calls[0][1] as URLSearchParams;
    expect(body.get('To')).toBe(AGENT_PHONE);
    expect(body.get('Url')).toBe(
      `https://api.example.com/api/v1/voice/webhook/callback/agent-answered?attemptId=${placed.attemptId}`,
    );
    await expectAppError(
      service.place(businessId, userId, call.id, {}),
      'VOICE_DIALER_AGENT_UNAVAILABLE',
    );

    const xml = await service.agentAnsweredTwiml(placed.attemptId);
    expect(xml).toContain('<Number>+14155550151</Number>');
    await service.customerResult(placed.attemptId, 'completed', 30);
    const callback = await prisma.voiceCallback.findUniqueOrThrow({
      where: { phoneCallId: call.id },
    });
    expect(callback).toMatchObject({ status: 'connected', attemptCount: 1 });

    await service.complete(businessId, userId, callback.id, {
      outcome: 'booked',
    });
    const handled = await prisma.phoneCall.findUniqueOrThrow({
      where: { id: call.id },
    });
    expect(handled.resolvedAt).not.toBeNull();
    const list = await service.list(businessId);
    expect(list.summary.recovered).toBe(1);
    expect(
      list.items.find((item) => item.callId === call.id)?.callback?.attempts,
    ).toHaveLength(2);
  });

  it('never dials a suppressed number, and records a do-not-call outcome as a suppression', async () => {
    await prisma.voiceSuppressionEntry.create({
      data: {
        businessId,
        phoneE164: '+14155550152',
        source: 'customer_request',
        reason: 'Asked not to be called',
        effectiveAt: new Date(Date.now() - 1000),
      },
    });
    const suppressed = await missedCall('+14155550152');
    const result = await service.place(businessId, userId, suppressed.id, {
      callerRequestedCallback: true,
    });
    expect(result).toMatchObject({ placed: false, reasonCode: 'suppressed' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).not.toHaveBeenCalled();

    const call = await missedCall('+14155550153');
    const first = await service.place(businessId, userId, call.id, {
      callerRequestedCallback: true,
    });
    await service.agentStatus(first.attemptId, 'no-answer');
    const callback = await prisma.voiceCallback.findUniqueOrThrow({
      where: { phoneCallId: call.id },
    });
    expect(callback).toMatchObject({ status: 'open', attemptCount: 0 });
    await service.complete(businessId, userId, callback.id, {
      outcome: 'do_not_call',
    });
    expect(
      await prisma.voiceSuppressionEntry.count({
        where: {
          businessId,
          phoneE164: '+14155550153',
          source: 'callback_outcome',
        },
      }),
    ).toBe(1);
  });

  it('returns the eligibility result for a manual dial when the provider is not configured', async () => {
    const call = await missedCall('+14155550154');
    const token = config.TWILIO_AUTH_TOKEN;
    config.TWILIO_AUTH_TOKEN = undefined;
    const result = await service.place(businessId, userId, call.id, {
      callerRequestedCallback: true,
    });
    config.TWILIO_AUTH_TOKEN = token;
    expect(result).toMatchObject({
      eligible: true,
      placed: false,
      reasonCode: 'provider_not_configured',
      manualDialNumber: '+14155550154',
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
