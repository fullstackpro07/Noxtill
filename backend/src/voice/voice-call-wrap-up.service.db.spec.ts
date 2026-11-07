import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import { PhoneCallStatus, VoiceCallWrapUpDisposition } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { AppException } from '../common/filters/app.exception';
import { VoiceCallWrapUpService } from './voice-call-wrap-up.service';

class FakeClsService {
  private readonly values: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.values[key] as T;
  }
  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('VoiceCallWrapUpService (MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceCallWrapUpService;
  let businessId: string;
  let otherBusinessId: string;
  let userId: string;
  let completedCallId: string;
  let liveCallId: string;
  let cls: FakeClsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const audit = new AuditService(tenant, cls as unknown as ClsService);
    service = new VoiceCallWrapUpService(tenant, audit);

    const stamp = randomUUID();
    const [business, otherBusiness, user] = await Promise.all([
      prisma.business.create({
        data: { name: 'Voice Wrap-up QA', slug: `voice-wrapup-${stamp}` },
      }),
      prisma.business.create({
        data: {
          name: 'Other Voice Wrap-up QA',
          slug: `voice-wrapup-other-${stamp}`,
        },
      }),
      prisma.user.create({
        data: {
          email: `voice-wrapup-${stamp}@example.com`,
          passwordHash: 'x',
          name: 'Wrap-up QA Owner',
        },
      }),
    ]);
    businessId = business.id;
    otherBusinessId = otherBusiness.id;
    userId = user.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);

    const [completedCall, liveCall] = await Promise.all([
      prisma.phoneCall.create({
        data: {
          businessId,
          callSid: `CA-wrapup-completed-${stamp}`,
          fromNumber: '+15555550001',
          status: PhoneCallStatus.completed,
        },
      }),
      prisma.phoneCall.create({
        data: {
          businessId,
          callSid: `CA-wrapup-live-${stamp}`,
          fromNumber: '+15555550002',
          status: PhoneCallStatus.in_progress,
        },
      }),
    ]);
    completedCallId = completedCall.id;
    liveCallId = liveCall.id;
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.voiceCallWrapUp.deleteMany({ where: { businessId } });
      await prisma.phoneCall.deleteMany({ where: { businessId } });
      await prisma.auditLog.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
    }
    if (otherBusinessId)
      await prisma.business.delete({ where: { id: otherBusinessId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);
  });

  it('stores one auditable final disposition against a completed call', async () => {
    expect(await service.get(businessId, completedCallId)).toBeNull();
    const result = await service.submit(businessId, userId, completedCallId, {
      disposition: VoiceCallWrapUpDisposition.callback_requested,
      tags: ['Booking', ' booking ', 'Needs review'],
      notes: 'Caller asked for a human callback about availability.',
    });

    expect(result).toMatchObject({
      callId: completedCallId,
      disposition: VoiceCallWrapUpDisposition.callback_requested,
      tags: ['Booking', 'Needs review'],
      notes: 'Caller asked for a human callback about availability.',
      completedByUserId: userId,
    });
    expect(await service.get(businessId, completedCallId)).toMatchObject({
      id: result.id,
      disposition: VoiceCallWrapUpDisposition.callback_requested,
    });
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'VoiceCallWrapUp',
          entityId: result.id,
          action: 'voice.call_wrap_up_submitted',
        },
      }),
    ).toBe(1);
  });

  it('rejects duplicate final submissions and never allows wrap-up on a live call', async () => {
    await expect(
      service.submit(businessId, userId, completedCallId, {
        disposition: VoiceCallWrapUpDisposition.resolved,
      }),
    ).rejects.toBeInstanceOf(AppException);

    await expect(
      service.submit(businessId, userId, liveCallId, {
        disposition: VoiceCallWrapUpDisposition.resolved,
      }),
    ).rejects.toBeInstanceOf(AppException);
    expect(
      await prisma.voiceCallWrapUp.findUnique({
        where: { callId: liveCallId },
      }),
    ).toBeNull();
  });

  it('does not reveal a call or its wrap-up across business boundaries', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    await expect(
      service.get(otherBusinessId, completedCallId),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      service.submit(otherBusinessId, userId, completedCallId, {
        disposition: VoiceCallWrapUpDisposition.resolved,
      }),
    ).rejects.toBeInstanceOf(AppException);
  });
});
