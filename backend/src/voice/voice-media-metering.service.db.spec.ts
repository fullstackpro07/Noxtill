import { createHash, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceMediaMeteringService } from './voice-media-metering.service';
import { VoiceOperationsService } from './voice-operations.service';

describe('Media usage and operational alerts (MySQL)', () => {
  const prisma = new PrismaService();
  const config = new ConfigService({
    LIVEKIT_API_KEY: 'qa-key',
    LIVEKIT_API_SECRET: 'qa-secret-not-real',
    TWILIO_ACCOUNT_SID: 'AC-qa',
  });
  const service = new VoiceMediaMeteringService(prisma, config);
  let businessId: string,
    userId: string,
    hostId: string,
    meetingId: string,
    callSid: string;
  beforeAll(async () => {
    await prisma.$connect();
    businessId = (
      await prisma.business.create({
        data: { name: 'QA media usage', slug: `qa-media-${randomUUID()}` },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          name: 'QA owner',
          email: `${randomUUID()}@example.com`,
          passwordHash: 'qa-only',
        },
      })
    ).id;
    hostId = (
      await prisma.businessUser.create({
        data: { businessId, userId, role: 'owner' },
      })
    ).id;
    meetingId = (
      await prisma.voiceVideoMeeting.create({
        data: {
          businessId,
          title: 'QA',
          scheduledAt: new Date(),
          durationMin: 30,
          timeZone: 'UTC',
          hostBusinessUserId: hostId,
          createdByUserId: userId,
        },
      })
    ).id;
    callSid = `CA-${randomUUID()}`;
    await prisma.phoneCall.create({
      data: {
        businessId,
        callSid,
        fromNumber: '+15550000000',
        isTestCall: true,
      },
    });
  });
  afterAll(async () => {
    await prisma.voiceUsageRecord.deleteMany({ where: { businessId } });
    await prisma.notification.deleteMany({ where: { businessId } });
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.voiceVideoMeeting.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });
  async function signed(event: Record<string, unknown>) {
    const body = Buffer.from(JSON.stringify(event));
    const token = new AccessToken('qa-key', 'qa-secret-not-real', { ttl: 60 });
    token.sha256 = createHash('sha256').update(body).digest('base64');
    return { body, auth: await token.toJwt() };
  }
  it('authenticates video evidence, measures provider duration once and refuses a modified body', async () => {
    const left = Math.floor(Date.now() / 1000);
    const event = {
      id: randomUUID(),
      event: 'participant_left',
      createdAt: String(left),
      room: { name: `voice-meeting-${meetingId}` },
      participant: {
        sid: 'PA-qa',
        identity: `host:${hostId}`,
        joinedAt: String(left - 61),
      },
    };
    const { body, auth } = await signed(event);
    await service.livekit(body, auth);
    await service.livekit(body, auth);
    const measurement = await prisma.voiceUsageRecord.findFirstOrThrow({
      where: { businessId, unit: 'video_participant_seconds' },
    });
    expect(Number(measurement.quantity)).toBe(61);
    expect(measurement.state).toBe('unpriced');
    expect(measurement.cost).toBeNull();
    expect(
      await prisma.voiceUsageRecord.count({
        where: { businessId, unit: 'video_participant_seconds' },
      }),
    ).toBe(1);
    await expect(
      service.livekit(Buffer.from(`${body.toString()} `), auth),
    ).rejects.toMatchObject({
      message: 'The video webhook signature is invalid.',
    });
  });
  it('reconciles reversed conference join/leave callbacks without inventing missing times', async () => {
    const left = new Date(Date.now() - 1000);
    const common = {
      AccountSid: 'AC-qa',
      ConferenceSid: 'CF-qa',
      CallSid: callSid,
      FriendlyName: callSid,
    };
    await service.conference({
      ...common,
      SequenceNumber: '2',
      Timestamp: left.toISOString(),
      StatusCallbackEvent: 'participant-leave',
    });
    expect(
      (
        await prisma.voiceUsageRecord.findFirstOrThrow({
          where: { businessId, unit: 'conference_participant_seconds' },
        })
      ).state,
    ).toBe('pending');
    await service.conference({
      ...common,
      SequenceNumber: '1',
      Timestamp: new Date(left.getTime() - 65000).toISOString(),
      StatusCallbackEvent: 'participant-join',
    });
    const row = await prisma.voiceUsageRecord.findFirstOrThrow({
      where: { businessId, unit: 'conference_participant_seconds' },
    });
    expect(Number(row.quantity)).toBe(65);
    expect(row.state).toBe('unpriced');
  });
  it('alerts the owner once per hour for measured failures and ignores test-call failures', async () => {
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const call = await prisma.phoneCall.create({
        data: {
          businessId,
          callSid: `CA-${randomUUID()}`,
          fromNumber: '+15550000001',
        },
      });
      await prisma.voiceRealtimeSession.create({
        data: {
          businessId,
          callId: call.id,
          tokenHash: 'qa',
          model: 'qa',
          status: 'failed',
          expiresAt: now,
          finishedAt: now,
        },
      });
    }
    const operations = new VoiceOperationsService(prisma);
    await operations.checkAlerts(now);
    await operations.checkAlerts(now);
    expect(
      await prisma.notification.count({
        where: { businessId, title: 'Live voice needs attention' },
      }),
    ).toBe(1);
    expect(
      await prisma.voiceUsageRecord.count({
        where: { businessId, unit: 'operations_alert' },
      }),
    ).toBe(1);
  });
});
