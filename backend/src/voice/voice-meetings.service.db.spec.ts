import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { VoiceMeetingsService } from './voice-meetings.service';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceMeetingsService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceMeetingsService;
  let cls: FakeClsService;
  let businessId: string;
  let userId: string;
  let hostId: string;
  let customerId: string;
  let appointmentId: string;
  let otherBusinessId: string;
  let otherUserId: string;
  let otherHostId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const audit = new AuditService(tenantPrisma, cls as unknown as ClsService);
    service = new VoiceMeetingsService(tenantPrisma, prisma, audit);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const business = await prisma.business.create({
      data: { name: 'Voice Meeting Test', slug: `voice-meeting-${suffix}` },
    });
    businessId = business.id;
    const user = await prisma.user.create({
      data: {
        email: `voice-meeting-${suffix}@example.com`,
        passwordHash: 'x',
        name: 'Meeting Host',
      },
    });
    userId = user.id;
    const host = await prisma.businessUser.create({
      data: { businessId, userId, role: Role.staff },
    });
    hostId = host.id;
    const customer = await prisma.customer.create({
      data: {
        businessId,
        phone: '+14155550126',
        name: 'QA Meeting Customer',
      },
    });
    customerId = customer.id;
    const product = await prisma.product.create({
      data: { businessId, name: 'QA Meeting Service' },
    });
    const appointment = await prisma.appointment.create({
      data: {
        businessId,
        serviceId: product.id,
        customerId,
        startsAt: new Date(Date.now() + 2 * 86_400_000),
        endsAt: new Date(Date.now() + 2 * 86_400_000 + 30 * 60_000),
      },
    });
    appointmentId = appointment.id;

    const otherBusiness = await prisma.business.create({
      data: {
        name: 'Other Voice Meeting Test',
        slug: `voice-meeting-other-${suffix}`,
      },
    });
    otherBusinessId = otherBusiness.id;
    const otherUser = await prisma.user.create({
      data: {
        email: `voice-meeting-other-${suffix}@example.com`,
        passwordHash: 'x',
        name: 'Other Host',
      },
    });
    otherUserId = otherUser.id;
    const otherHost = await prisma.businessUser.create({
      data: {
        businessId: otherBusinessId,
        userId: otherUserId,
        role: Role.staff,
      },
    });
    otherHostId = otherHost.id;

    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        if (businessId)
          await tx.business.delete({ where: { id: businessId } });
        if (otherBusinessId)
          await tx.business.delete({ where: { id: otherBusinessId } });
        if (userId) await tx.user.delete({ where: { id: userId } });
        if (otherUserId)
          await tx.user.delete({ where: { id: otherUserId } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
      await prisma.$disconnect();
    }
  });

  function meetingInput(title = 'QA secure meeting') {
    return {
      title,
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      durationMin: 45,
      timeZone: 'America/Los_Angeles',
      hostBusinessUserId: hostId,
    };
  }

  async function expectAppError(action: Promise<unknown>, code: string) {
    let caught: unknown;
    try {
      await action;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppException);
    if (caught instanceof AppException) {
      expect(caught.getResponse()).toMatchObject({ code });
    }
  }

  it('schedules against the canonical booking, creates a hashed guest link and discloses media is unavailable', async () => {
    const meeting = await service.create(businessId, userId, {
      ...meetingInput('QA booking follow-up meeting'),
      customerId,
      appointmentId,
    });
    expect(meeting).toMatchObject({
      businessId,
      customerId,
      appointmentId,
      hostBusinessUserId: hostId,
      status: 'scheduled',
    });
    const invite = await service.createInvite(businessId, userId, meeting.id, {
      email: 'QA.Guest@EXAMPLE.COM',
      guestName: 'QA guest',
    });
    expect(invite.token).toHaveLength(43);
    expect(invite.sharePath).toBe(`/meeting/${invite.token}`);

    const stored = await prisma.voiceMeetingInvite.findUniqueOrThrow({
      where: { id: invite.id },
    });
    expect(stored.email).toBe('qa.guest@example.com');
    expect(stored.tokenHash).toHaveLength(64);
    expect(stored.tokenHash).not.toBe(invite.token);

    const preview = await service.previewInvite(invite.token);
    expect(preview).toMatchObject({
      title: meeting.title,
      businessName: 'Voice Meeting Test',
      mediaAvailable: false,
    });
    expect(preview.message).toContain('not configured');
    expect(preview).not.toHaveProperty('email');
    expect((await service.list(businessId))[0]).toMatchObject({
      appointment: { id: appointmentId },
      customer: { id: customerId },
      inviteCount: 1,
      media: 'not_configured',
      recording: 'not_available',
    });
  });

  it('reschedules and cancels only scheduled meetings, revoking active guest links', async () => {
    const meeting = await service.create(businessId, userId, meetingInput());
    const invite = await service.createInvite(businessId, userId, meeting.id, {
      email: 'cancelled-guest@example.com',
    });
    const updated = await service.reschedule(businessId, userId, meeting.id, {
      scheduledAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      durationMin: 60,
    });
    expect(updated.durationMin).toBe(60);
    const canceled = await service.cancel(businessId, userId, meeting.id, {
      reason: 'QA meeting cancellation cleanup',
    });
    expect(canceled.status).toBe('cancelled');
    await expectAppError(
      service.previewInvite(invite.token),
      'VOICE_MEETING_INVITE_INVALID',
    );
    await expectAppError(
      service.reschedule(businessId, userId, meeting.id, {
        scheduledAt: new Date(Date.now() + 4 * 86_400_000).toISOString(),
        durationMin: 30,
      }),
      'VOICE_MEETING_INVALID',
    );
  });

  it('rejects expired or revoked invites and enforces tenant and host boundaries', async () => {
    const meeting = await service.create(businessId, userId, meetingInput());
    const invite = await service.createInvite(businessId, userId, meeting.id, {
      email: 'expired-guest@example.com',
    });
    await prisma.voiceMeetingInvite.update({
      where: { id: invite.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await expectAppError(
      service.previewInvite(invite.token),
      'VOICE_MEETING_INVITE_INVALID',
    );

    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    cls.set(CLS_KEY_USER_ID, otherUserId);
    expect(await service.list(otherBusinessId)).toEqual([]);
    await expectAppError(
      service.reschedule(otherBusinessId, otherUserId, meeting.id, {
        scheduledAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        durationMin: 30,
      }),
      'VOICE_MEETING_NOT_FOUND',
    );
    await expectAppError(
      service.create(otherBusinessId, otherUserId, {
        ...meetingInput('Cross-business host test'),
        hostBusinessUserId: hostId,
      }),
      'VOICE_MEETING_HOST_NOT_FOUND',
    );
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);

    const auditRows = await prisma.auditLog.findMany({
      where: { businessId, entity: 'VoiceVideoMeeting' },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    expect(auditRows.map((row) => row.action)).toContain('voice.meeting.created');
    expect(auditRows.map((row) => row.action)).toContain('voice.meeting.cancelled');
  });
});
