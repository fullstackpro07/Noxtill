import {
  PhoneCallStatus,
  Role,
  VoiceAgentPresenceStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { VoiceHumanAgentDispatchService } from './voice-human-agent-dispatch.service';
import { PrismaService as AppPrismaService } from '../prisma/prisma.service';

describe('VoiceHumanAgentDispatchService (real MySQL)', () => {
  let prisma: AppPrismaService;
  let service: VoiceHumanAgentDispatchService;
  let businessId: string;
  let businessUserId: string;
  let userId: string;
  let profileId: string;
  const additionalUserIds: string[] = [];
  const stamp = randomUUID();

  beforeAll(async () => {
    prisma = new AppPrismaService();
    await prisma.$connect();
    service = new VoiceHumanAgentDispatchService(prisma);

    const business = await prisma.business.create({
      data: { name: 'Voice Dispatch Test', slug: `voice-dispatch-${stamp}` },
    });
    businessId = business.id;
    const user = await prisma.user.create({
      data: {
        email: `voice-dispatch-${stamp}@example.com`,
        passwordHash: 'test-only',
        name: 'Available Human Agent',
        phone: '+15550002222',
      },
    });
    userId = user.id;
    const businessUser = await prisma.businessUser.create({
      data: { businessId, userId, role: Role.staff },
    });
    businessUserId = businessUser.id;
    const profile = await prisma.voiceHumanAgentProfile.create({
      data: {
        businessId,
        staffUserId: businessUserId,
        maxConcurrentCalls: 1,
        active: true,
        presenceStatus: VoiceAgentPresenceStatus.available,
        lastHeartbeatAt: new Date(),
      },
    });
    profileId = profile.id;
  });

  afterAll(async () => {
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.voiceHumanAgentProfile.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.delete({ where: { id: userId } });
    if (additionalUserIds.length) {
      await prisma.user.deleteMany({
        where: { id: { in: additionalUserIds } },
      });
    }
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.voiceHumanAgentProfile.deleteMany({
      where: { businessId, id: { not: profileId } },
    });
    await prisma.businessUser.deleteMany({
      where: { businessId, id: { not: businessUserId } },
    });
    if (additionalUserIds.length) {
      await prisma.user.deleteMany({
        where: { id: { in: additionalUserIds } },
      });
      additionalUserIds.length = 0;
    }
    await prisma.voiceHumanAgentProfile.update({
      where: { id: profileId },
      data: { skillTags: [] },
    });
  });

  async function createLiveCall() {
    return prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-dispatch-${randomUUID()}`,
        fromNumber: '+15550003333',
        status: PhoneCallStatus.in_progress,
        transcript: [],
      },
    });
  }

  it('reserves an available staff phone, records provider connection, then frees the slot', async () => {
    const firstCall = await createLiveCall();
    const secondCall = await createLiveCall();

    const first = await service.reserve(businessId, firstCall.id);
    expect(first).toMatchObject({
      callId: firstCall.id,
      profileId,
      staffUserId: businessUserId,
      name: 'Available Human Agent',
      phone: '+15550002222',
    });

    expect(await service.reserve(businessId, secondCall.id)).toBeNull();
    const offered = await prisma.voiceHumanAgentAssignment.findUniqueOrThrow({
      where: { callId: firstCall.id },
    });
    expect(offered.status).toBe('offered');
    expect(offered.expiresAt?.getTime()).toBeGreaterThan(Date.now());

    await service.observeDialStatus(firstCall.id, 'in-progress');
    const connected = await prisma.voiceHumanAgentAssignment.findUniqueOrThrow({
      where: { callId: firstCall.id },
    });
    expect(connected).toMatchObject({
      status: 'connected',
      connected: true,
      providerStatus: 'in-progress',
      expiresAt: null,
    });
    expect(await service.reserve(businessId, secondCall.id)).toBeNull();

    await service.observeDialStatus(firstCall.id, 'completed');
    const released = await prisma.voiceHumanAgentAssignment.findUniqueOrThrow({
      where: { callId: firstCall.id },
    });
    expect(released).toMatchObject({
      status: 'released',
      connected: true,
      providerStatus: 'completed',
    });
    expect(released.releasedAt).not.toBeNull();
    expect(await service.reserve(businessId, secondCall.id)).not.toBeNull();
  });

  it('serializes simultaneous reservations so one profile is not over capacity', async () => {
    const calls = await Promise.all([createLiveCall(), createLiveCall()]);
    const results = await Promise.all(
      calls.map((call) => service.reserve(businessId, call.id)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      await prisma.voiceHumanAgentAssignment.count({
        where: {
          businessId,
          profileId,
          status: { in: ['offered', 'connected'] },
        },
      }),
    ).toBe(1);
  });

  it('prefers a profile with an exact saved skill match for the classified caller topic', async () => {
    await prisma.voiceHumanAgentProfile.update({
      where: { id: profileId },
      data: { skillTags: ['general support'] },
    });
    const topicUser = await prisma.user.create({
      data: {
        email: `voice-dispatch-topic-${stamp}@example.com`,
        passwordHash: 'test-only',
        name: 'Booking Specialist',
        phone: '+15550002223',
      },
    });
    additionalUserIds.push(topicUser.id);
    const topicMember = await prisma.businessUser.create({
      data: { businessId, userId: topicUser.id, role: Role.staff },
    });
    const topicProfile = await prisma.voiceHumanAgentProfile.create({
      data: {
        businessId,
        staffUserId: topicMember.id,
        skillTags: ['Booking Availability'],
        active: true,
        presenceStatus: VoiceAgentPresenceStatus.available,
        lastHeartbeatAt: new Date(),
      },
    });
    const call = await createLiveCall();

    const reservation = await service.reserve(
      businessId,
      call.id,
      'booking_availability',
    );

    expect(reservation?.profileId).toBe(topicProfile.id);
  });

  it('does not route to stale, unavailable or phone-less profiles', async () => {
    await prisma.voiceHumanAgentProfile.update({
      where: { id: profileId },
      data: { lastHeartbeatAt: new Date(Date.now() - 120_000) },
    });
    const staleCall = await createLiveCall();
    expect(await service.reserve(businessId, staleCall.id)).toBeNull();

    await prisma.voiceHumanAgentProfile.update({
      where: { id: profileId },
      data: {
        lastHeartbeatAt: new Date(),
        presenceStatus: VoiceAgentPresenceStatus.busy,
      },
    });
    const busyCall = await createLiveCall();
    expect(await service.reserve(businessId, busyCall.id)).toBeNull();
  });

  it('releases an expired ringing reservation with an auditable timeout status', async () => {
    const call = await createLiveCall();
    const expiredAt = new Date(Date.now() - 1_000);
    const assignment = await prisma.voiceHumanAgentAssignment.create({
      data: {
        businessId,
        callId: call.id,
        staffUserId: businessUserId,
        profileId,
        status: 'offered',
        expiresAt: expiredAt,
      },
    });

    const result = await service.releaseExpiredOffers(businessId);
    const released = await prisma.voiceHumanAgentAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
    });

    expect(result.count).toBe(1);
    expect(released).toMatchObject({
      status: 'released',
      providerStatus: 'reservation_timeout',
    });
    expect(released.releasedAt).not.toBeNull();
  });
});
