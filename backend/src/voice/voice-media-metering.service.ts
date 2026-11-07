import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookReceiver } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { VoiceVideoRoomService } from './voice-video-room.service';

/** Provider-authenticated event times, not browser timers or scheduled meeting duration. */
@Injectable()
export class VoiceMediaMeteringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly videoRooms?: VoiceVideoRoomService,
  ) {}

  async livekit(body: Buffer, authorization?: string) {
    const key = this.config.get<string>('LIVEKIT_API_KEY');
    const secret = this.config.get<string>('LIVEKIT_API_SECRET');
    if (!key || !secret)
      throw new AppException(
        'VOICE_VIDEO_NOT_CONFIGURED',
        'Live video is not configured.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    let event: Awaited<ReturnType<WebhookReceiver['receive']>>;
    try {
      event = await new WebhookReceiver(key, secret).receive(
        body.toString('utf8'),
        authorization,
      );
    } catch {
      throw new AppException(
        'VOICE_VIDEO_WEBHOOK_INVALID',
        'The video webhook signature is invalid.',
        HttpStatus.FORBIDDEN,
      );
    }
    await this.videoRooms?.providerEvent(event);
    const roomName = event.room?.name;
    if (
      !roomName?.startsWith('voice-meeting-') ||
      !event.id ||
      event.id.length > 100
    )
      return { accepted: false };
    const meeting = await this.prisma.voiceVideoMeeting.findUnique({
      where: { id: roomName.slice('voice-meeting-'.length) },
    });
    if (
      !meeting ||
      !event.participant ||
      !['participant_joined', 'participant_left'].includes(event.event)
    )
      return {
        accepted: Boolean(
          meeting &&
          this.videoRooms &&
          ['room_started', 'room_finished'].includes(event.event),
        ),
      };
    const participant = event.participant;
    const identity = participant.identity;
    const allowed =
      identity === `host:${meeting.hostBusinessUserId}` ||
      (identity.startsWith('guest:') &&
        Boolean(
          await this.prisma.voiceMeetingInvite.findFirst({
            where: {
              id: identity.slice(6),
              meetingId: meeting.id,
              businessId: meeting.businessId,
            },
            select: { id: true },
          }),
        ));
    if (!allowed || !participant.sid) return { accepted: false };
    const at = Number(event.createdAt);
    const joinedAt = Number(participant.joinedAt);
    if (!Number.isSafeInteger(at) || at <= 0 || at * 1000 > Date.now() + 300000)
      return { accepted: false };
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM voice_video_meetings WHERE id = ${meeting.id} FOR UPDATE`;
      const eventKey = `livekit:event:${event.id}`;
      await tx.voiceUsageRecord.upsert({
        where: {
          businessId_eventKey: { businessId: meeting.businessId, eventKey },
        },
        update: {},
        create: {
          businessId: meeting.businessId,
          eventKey,
          provider: 'noxtill',
          unit: 'video_provider_event',
          quantity: 0,
          state: 'observed',
          measuredAt: new Date(at * 1000),
          evidence: {
            meetingId: meeting.id,
            participantSid: participant.sid,
            event: event.event,
            providerTimestamp: at,
          },
        },
      });
      if (event.event !== 'participant_left') return;
      const validDuration =
        Number.isSafeInteger(joinedAt) && joinedAt > 0 && joinedAt <= at;
      const measurementKey = `livekit:participant:${participant.sid}`;
      await tx.voiceUsageRecord.upsert({
        where: {
          businessId_eventKey: {
            businessId: meeting.businessId,
            eventKey: measurementKey,
          },
        },
        update: {},
        create: {
          businessId: meeting.businessId,
          eventKey: measurementKey,
          provider: 'livekit',
          unit: 'video_participant_seconds',
          quantity: validDuration ? at - joinedAt : 0,
          state: validDuration ? 'unpriced' : 'pending',
          measuredAt: new Date(at * 1000),
          evidence: {
            meetingId: meeting.id,
            participantSid: participant.sid,
            joinedAt: validDuration ? joinedAt : null,
            leftAt: at,
            source: 'signed_livekit_webhook',
            invoiceCostAvailable: false,
          },
        },
      });
    });
    return { accepted: true };
  }

  /** Called only after the controller verifies Twilio's signature. */
  async conference(body: Record<string, string>) {
    if (
      body.AccountSid !== this.config.get<string>('TWILIO_ACCOUNT_SID') ||
      !['participant-join', 'participant-leave'].includes(
        body.StatusCallbackEvent,
      )
    )
      return;
    const call = await this.prisma.phoneCall.findUnique({
      where: { callSid: body.FriendlyName },
    });
    if (
      !call ||
      !body.ConferenceSid ||
      !body.CallSid ||
      !/^\d+$/.test(body.SequenceNumber ?? '')
    )
      return;
    const at = new Date(body.Timestamp);
    if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 300000)
      return;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM phone_calls WHERE id = ${call.id} FOR UPDATE`;
      const eventKey = `conference:event:${body.ConferenceSid}:${body.SequenceNumber}`;
      await tx.voiceUsageRecord.upsert({
        where: {
          businessId_eventKey: { businessId: call.businessId, eventKey },
        },
        update: {},
        create: {
          businessId: call.businessId,
          callId: call.id,
          eventKey,
          provider: 'noxtill',
          unit: 'conference_provider_event',
          quantity: 0,
          state: 'observed',
          measuredAt: at,
          evidence: {
            conferenceSid: body.ConferenceSid,
            participantCallSid: body.CallSid,
            event: body.StatusCallbackEvent,
          },
        },
      });
      const records = await tx.voiceUsageRecord.findMany({
        where: {
          businessId: call.businessId,
          callId: call.id,
          unit: 'conference_provider_event',
          evidence: { path: '$.participantCallSid', equals: body.CallSid },
        },
        orderBy: [{ measuredAt: 'asc' }, { id: 'asc' }],
      });
      const relevant = records.filter(
        (r) =>
          (r.evidence as { conferenceSid?: string }).conferenceSid ===
          body.ConferenceSid,
      );
      const joined = relevant.find(
        (r) => (r.evidence as { event?: string }).event === 'participant-join',
      );
      const left = relevant.find(
        (r) => (r.evidence as { event?: string }).event === 'participant-leave',
      );
      if (!left) return;
      const validDuration = joined && left.measuredAt >= joined.measuredAt;
      const measurementKey = `conference:participant:${body.ConferenceSid}:${body.CallSid}`;
      const data = {
        quantity: validDuration
          ? (left.measuredAt.getTime() - joined.measuredAt.getTime()) / 1000
          : 0,
        state: validDuration ? 'unpriced' : 'pending',
        evidence: {
          source: 'signed_twilio_conference_callbacks',
          providerDurationConfirmed: Boolean(validDuration),
          participantCallSid: body.CallSid,
          invoiceCostAvailable: false,
        },
      };
      await tx.voiceUsageRecord.upsert({
        where: {
          businessId_eventKey: {
            businessId: call.businessId,
            eventKey: measurementKey,
          },
        },
        update: data,
        create: {
          businessId: call.businessId,
          callId: call.id,
          eventKey: measurementKey,
          provider: 'twilio',
          unit: 'conference_participant_seconds',
          measuredAt: left.measuredAt,
          ...data,
        },
      });
    });
  }
}
