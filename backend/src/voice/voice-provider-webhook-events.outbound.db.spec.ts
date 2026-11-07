import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceCallService } from './voice-call.service';
import { VoiceCallbacksService } from './voice-callbacks.service';
import { VoiceOutboundDialerService } from './voice-outbound-dialer.service';
import { VoiceProviderWebhookEventsService } from './voice-provider-webhook-events.service';

describe('VoiceProviderWebhookEventsService — outbound status callbacks (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceProviderWebhookEventsService;
  let businessId: string;
  let userId: string;
  let dialAttemptId: string;
  let callbackAttemptId: string;
  const dialer = { agentStatus: jest.fn(), answeringMachineResult: jest.fn() };
  const callbacks = { agentStatus: jest.fn() };
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new VoiceProviderWebhookEventsService(
      prisma,
      {} as VoiceCallService,
      undefined,
      undefined,
      dialer as unknown as VoiceOutboundDialerService,
      callbacks as unknown as VoiceCallbacksService,
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Inbox Outbound', slug: `inbox-out-${suffix}` },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          email: `inbox-${suffix}@example.com`,
          passwordHash: 'x',
          name: 'Agent',
        },
      })
    ).id;
    const staff = await prisma.businessUser.create({
      data: { businessId, userId, role: Role.staff },
    });
    const profile = await prisma.voiceHumanAgentProfile.create({
      data: { businessId, staffUserId: staff.id },
    });
    const customer = await prisma.customer.create({
      data: { businessId, name: 'Contact', phone: '+14155550301' },
    });
    const campaign = await prisma.voiceOutboundCampaign.create({
      data: {
        businessId,
        name: 'Inbox QA',
        purpose: 'callback',
        callerType: 'live_agent',
        countryCode: 'US',
        timeZone: 'UTC',
        openingScript: 'Hello.',
        createdByUserId: userId,
      },
    });
    const member = await prisma.voiceOutboundCampaignMember.create({
      data: { businessId, campaignId: campaign.id, customerId: customer.id },
    });
    dialAttemptId = (
      await prisma.voiceOutboundDialAttempt.create({
        data: {
          businessId,
          campaignId: campaign.id,
          memberId: member.id,
          agentProfileId: profile.id,
          status: 'agent_ringing',
          agentCallSid: `CA${'1'.repeat(32)}${suffix}`.slice(0, 64),
          createdByUserId: userId,
        },
      })
    ).id;
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-inbox-${suffix}`,
        fromNumber: '+14155550302',
        status: 'missed',
        transcript: [],
      },
    });
    const callback = await prisma.voiceCallback.create({
      data: { businessId, phoneCallId: call.id, phoneE164: '+14155550302' },
    });
    callbackAttemptId = (
      await prisma.voiceCallbackAttempt.create({
        data: {
          businessId,
          callbackId: callback.id,
          agentProfileId: profile.id,
          status: 'agent_ringing',
          placedByUserId: userId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.voiceProviderWebhookEvent.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.user.delete({ where: { id: userId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    dialer.agentStatus.mockReset();
    dialer.answeringMachineResult.mockReset();
    callbacks.agentStatus.mockReset();
  });

  it('stores each outbound status callback once and projects a duplicate delivery once', async () => {
    await service.receiveDialerAgentStatus(dialAttemptId, 'no-answer');
    await service.receiveDialerAgentStatus(dialAttemptId, 'no-answer');
    await service.receiveDialerAnsweringMachine(
      dialAttemptId,
      'machine_end_beep',
    );
    await service.receiveCallbackAgentStatus(callbackAttemptId, 'busy');
    expect(dialer.agentStatus).toHaveBeenCalledTimes(1);
    expect(dialer.agentStatus).toHaveBeenCalledWith(dialAttemptId, 'no-answer');
    expect(dialer.answeringMachineResult).toHaveBeenCalledWith(
      dialAttemptId,
      'machine_end_beep',
    );
    expect(callbacks.agentStatus).toHaveBeenCalledWith(
      callbackAttemptId,
      'busy',
    );
    const events = await prisma.voiceProviderWebhookEvent.findMany({
      where: { businessId },
      orderBy: { receivedAt: 'asc' },
    });
    expect(events.map((e) => e.eventType).sort()).toEqual([
      'callback.agent.status',
      'dialer.agent.status',
      'dialer.amd',
    ]);
    expect(events.every((e) => e.state === 'processed')).toBe(true);
  });

  it('keeps a failed projection retryable and lets an operator replay it', async () => {
    callbacks.agentStatus.mockRejectedValueOnce(
      new Error('database briefly unavailable'),
    );
    await expect(
      service.receiveCallbackAgentStatus(callbackAttemptId, 'no-answer'),
    ).rejects.toThrow('database briefly unavailable');
    const failed = await prisma.voiceProviderWebhookEvent.findFirstOrThrow({
      where: {
        businessId,
        eventType: 'callback.agent.status',
        state: 'failed',
      },
    });
    await service.replay(businessId, userId, failed.id);
    expect(callbacks.agentStatus).toHaveBeenLastCalledWith(
      callbackAttemptId,
      'no-answer',
    );
    const replayed = await prisma.voiceProviderWebhookEvent.findUniqueOrThrow({
      where: { id: failed.id },
    });
    expect(replayed.state).toBe('processed');
  });

  it('ignores callbacks for unknown attempts without storing anything', async () => {
    const before = await prisma.voiceProviderWebhookEvent.count({
      where: { businessId },
    });
    await service.receiveDialerAgentStatus(
      '00000000-0000-0000-0000-000000000000',
      'completed',
    );
    expect(
      await prisma.voiceProviderWebhookEvent.count({ where: { businessId } }),
    ).toBe(before);
  });
});
