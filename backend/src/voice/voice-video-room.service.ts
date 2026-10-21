import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  type WebhookEvent,
} from 'livekit-server-sdk';
import { Prisma, VoiceVideoMeeting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { resolvePolicies } from '../common/policies/policies.service';
import {
  assertMeetingJoinWindow,
  findValidMeetingInvite,
  liveKitVideoConfig,
} from './voice-meeting-access.util';
import { VOICE_ERROR_CODES } from './voice.constants';
import { VoiceVideoRecordingService } from './voice-video-recording.service';

/** Control plane for the existing meeting, not a second calendar or simulated media room. */
@Injectable()
export class VoiceVideoRoomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly recordings?: VoiceVideoRecordingService,
  ) {}

  protected roomClient() {
    const cfg = this.requireConfig();
    return new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret, {
      requestTimeout: 5,
    });
  }

  private requireConfig() {
    const cfg = liveKitVideoConfig(this.config);
    if (!cfg)
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'Live video not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET on the server.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return cfg;
  }

  private async host(businessId: string, actorUserId: string, id: string) {
    const meeting = await this.prisma.voiceVideoMeeting.findFirst({
      where: { id, businessId },
    });
    if (!meeting)
      throw new AppException(
        VOICE_ERROR_CODES.MEETING_NOT_FOUND,
        'Video meeting was not found.',
        HttpStatus.NOT_FOUND,
      );
    const staff = await this.prisma.businessUser.findFirst({
      where: {
        id: meeting.hostBusinessUserId,
        businessId,
        userId: actorUserId,
        active: true,
      },
      include: { user: { select: { name: true } } },
    });
    if (!staff)
      throw new AppException(
        VOICE_ERROR_CODES.MEETING_HOST_NOT_FOUND,
        'Only the assigned active meeting host can use host controls.',
        HttpStatus.FORBIDDEN,
      );
    return { meeting, staff };
  }

  private async audit(
    tx: Prisma.TransactionClient,
    businessId: string,
    actorUserId: string | null,
    meetingId: string,
    action: string,
    after: Prisma.InputJsonObject,
  ) {
    await tx.auditLog.create({
      data: {
        businessId,
        actorUserId,
        entity: 'VoiceVideoMeeting',
        entityId: meetingId,
        action,
        after,
      },
    });
  }

  async hostJoinToken(businessId: string, actorUserId: string, id: string) {
    const { meeting, staff } = await this.host(businessId, actorUserId, id);
    assertMeetingJoinWindow(meeting);
    this.requireConfig();
    await this.prisma.voiceMeetingParticipant.upsert({
      where: {
        meetingId_identity: { meetingId: id, identity: `host:${staff.id}` },
      },
      create: {
        businessId,
        meetingId: id,
        identity: `host:${staff.id}`,
        role: 'host',
        admission: 'admitted',
        admittedAt: new Date(),
        decidedByUserId: actorUserId,
      },
      update: {},
    });
    return this.mint(
      meeting,
      `host:${staff.id}`,
      staff.user.name,
      'host',
      actorUserId,
    );
  }

  async guestJoinToken(token: string) {
    const invite = await findValidMeetingInvite(this.prisma, token);
    assertMeetingJoinWindow(invite.meeting);
    this.requireConfig();
    const participant = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM voice_video_meetings WHERE id = ${invite.meetingId} FOR UPDATE`;
      const current = await tx.voiceMeetingInvite.findFirst({
        where: {
          id: invite.id,
          businessId: invite.businessId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          meeting: { status: 'scheduled', endRequestedAt: null },
        },
      });
      if (!current)
        throw new AppException(
          VOICE_ERROR_CODES.MEETING_INVITE_INVALID,
          'This invite no longer permits joining.',
          HttpStatus.NOT_FOUND,
        );
      const previous = await tx.voiceMeetingParticipant.findUnique({
        where: { inviteId: invite.id },
      });
      if (previous) return previous;
      const created = await tx.voiceMeetingParticipant.create({
        data: {
          businessId: invite.businessId,
          meetingId: invite.meetingId,
          inviteId: invite.id,
          identity: `guest:${invite.id}`,
          role: 'guest',
        },
      });
      await this.audit(
        tx,
        invite.businessId,
        null,
        invite.meetingId,
        'voice.meeting.lobby_requested',
        { participantId: created.id },
      );
      return created;
    });
    if (participant.admission !== 'admitted')
      return {
        status: participant.admission,
        message:
          participant.admission === 'waiting'
            ? 'Waiting for the host to admit you. No media room token has been issued.'
            : 'The host has not admitted this invitation.',
      };
    // An application admission is not proof the host is connected to LiveKit.
    const participants = await this.providerParticipants(invite.meetingId);
    if (
      !participants.some(
        (p) => p.identity === `host:${invite.meeting.hostBusinessUserId}`,
      )
    ) {
      return {
        status: 'waiting',
        message:
          'The host is not connected. Please wait for the host to return.',
      };
    }
    const recordingGate = await this.recordings?.canGuestJoin(
      invite.businessId,
      invite.meetingId,
      invite.id,
    );
    if (recordingGate && !recordingGate.allowed)
      return {
        status:
          recordingGate.consent?.status === 'stopping'
            ? 'recording_stopping'
            : 'recording_consent_required',
        recordingConsent: recordingGate.consent,
        message:
          recordingGate.consent?.status === 'stopping'
            ? 'The meeting recording is stopping. New joins are paused.'
            : 'The host is recording this meeting. Read the notice and agree before joining.',
      };
    return this.mint(
      invite.meeting,
      participant.identity,
      invite.guestName || 'Invited guest',
      'guest',
      null,
    );
  }

  async guestLobby(token: string) {
    const invite = await findValidMeetingInvite(this.prisma, token);
    assertMeetingJoinWindow(invite.meeting);
    const participant = await this.prisma.voiceMeetingParticipant.findUnique({
      where: { inviteId: invite.id },
    });
    const recordingConsent = await this.recordings?.activeGuestConsent(
      invite.businessId,
      invite.meetingId,
      invite.id,
    );
    return {
      status: participant?.admission ?? 'not_requested',
      recordingConsent: recordingConsent ?? null,
      message:
        participant?.admission === 'admitted'
          ? 'The host admitted your invitation. Joining still requires the host to be connected.'
          : participant?.admission === 'waiting'
            ? 'Waiting for host admission.'
            : participant?.admission === 'denied' ||
                participant?.admission === 'revoked'
              ? 'This invitation has not been admitted.'
              : 'Request admission to the meeting.',
    };
  }

  async hostLobby(businessId: string, actorUserId: string, id: string) {
    const { meeting } = await this.host(businessId, actorUserId, id);
    const people = await this.prisma.voiceMeetingParticipant.findMany({
      where: { businessId, meetingId: id },
      include: {
        invite: {
          select: { guestName: true, revokedAt: true, expiresAt: true },
        },
      },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      take: 250,
    });
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const recording = await this.recordings?.hostStatus(
      businessId,
      actorUserId,
      id,
    );
    const recordingPolicy = meeting.recordingPolicyVersionId
      ? await this.prisma.voiceCompliancePolicyVersion.findFirst({
          where: {
            id: meeting.recordingPolicyVersionId,
            businessId,
            pack: { businessId },
          },
          include: { pack: { select: { countryCode: true, purpose: true } } },
        })
      : null;
    return {
      meetingId: id,
      roomState: meeting.roomState,
      endRequestedAt: meeting.endRequestedAt?.toISOString() ?? null,
      guestLimit: resolvePolicies(business).num('voice.meetingGuestLimit'),
      recording,
      recordingPolicy: recordingPolicy
        ? {
            version: recordingPolicy.version,
            countryCode: recordingPolicy.pack.countryCode,
            purpose: recordingPolicy.pack.purpose,
            notice: [
              recordingPolicy.recordingNoticeText,
              recordingPolicy.meetingAiProcessingAllowed
                ? recordingPolicy.meetingAiProcessingNoticeText
                : null,
            ]
              .filter((value): value is string => Boolean(value?.trim()))
              .map((value) => value.trim())
              .join('\n\n'),
            aiProcessingAllowed: recordingPolicy.meetingAiProcessingAllowed,
            allowed:
              recordingPolicy.status === 'published' &&
              recordingPolicy.recordingAllowed,
            retentionDays: recordingPolicy.recordingRetentionDays,
          }
        : null,
      participants: people.map((p) => ({
        id: p.id,
        role: p.role,
        name:
          p.role === 'host'
            ? 'Assigned host'
            : p.invite?.guestName || 'Invited guest',
        admission: p.admission,
        inviteValid:
          p.role === 'host' ||
          Boolean(
            p.invite && !p.invite.revokedAt && p.invite.expiresAt > new Date(),
          ),
        requestedAt: p.requestedAt.toISOString(),
        providerJoinedAt: p.providerJoinedAt?.toISOString() ?? null,
        providerLeftAt: p.providerLeftAt?.toISOString() ?? null,
      })),
      tokenNotice:
        'New joins are denied after removal or ending. Already issued tokens expire within 60 seconds; provider revocation depends on the deployment. Admission alone does not mean connected.',
    };
  }

  async decide(
    businessId: string,
    actorUserId: string,
    id: string,
    participantId: string,
    admission: 'admitted' | 'denied',
    reason: string,
  ) {
    const { meeting } = await this.host(businessId, actorUserId, id);
    assertMeetingJoinWindow(meeting);
    if (admission === 'admitted') {
      const online = await this.providerParticipants(id);
      if (
        !online.some((p) => p.identity === `host:${meeting.hostBusinessUserId}`)
      )
        throw new AppException(
          'VOICE_MEETING_HOST_NOT_CONNECTED',
          'Join the room as host before admitting a guest.',
          HttpStatus.CONFLICT,
        );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM voice_video_meetings WHERE id = ${id} AND business_id = ${businessId} FOR UPDATE`;
      const active = await tx.voiceVideoMeeting.findFirst({
        where: { id, businessId },
      });
      if (!active) throw this.invalid('Meeting not found.');
      assertMeetingJoinWindow(active);
      const target = await tx.voiceMeetingParticipant.findFirst({
        where: {
          id: participantId,
          businessId,
          meetingId: id,
          role: 'guest',
          invite: { revokedAt: null, expiresAt: { gt: new Date() } },
        },
      });
      if (!target) throw this.invalid('This guest request is not available.');
      if (target.admission === admission) return { admission };
      if (admission === 'denied' && target.admission === 'admitted')
        throw this.invalid(
          'Use Remove for an already admitted guest so the provider is asked to disconnect them.',
        );
      if (admission === 'admitted') {
        const business = await tx.business.findUniqueOrThrow({
          where: { id: businessId },
        });
        const limit = resolvePolicies(business).num('voice.meetingGuestLimit')!;
        const count = await tx.voiceMeetingParticipant.count({
          where: {
            businessId,
            meetingId: id,
            role: 'guest',
            admission: 'admitted',
            invite: { revokedAt: null, expiresAt: { gt: new Date() } },
          },
        });
        if (count >= limit)
          throw new AppException(
            'VOICE_MEETING_CAPACITY_REACHED',
            `This meeting already has ${limit} admitted guest(s). Remove a guest before admitting another.`,
            HttpStatus.CONFLICT,
          );
      }
      await tx.voiceMeetingParticipant.update({
        where: { id: target.id },
        data: {
          admission,
          admittedAt: admission === 'admitted' ? new Date() : null,
          decidedByUserId: actorUserId,
          decisionReason: reason.trim(),
        },
      });
      await this.audit(
        tx,
        businessId,
        actorUserId,
        id,
        `voice.meeting.guest_${admission}`,
        { participantId, reason: reason.trim() },
      );
      return { admission };
    });
  }

  async moderate(
    businessId: string,
    actorUserId: string,
    id: string,
    participantId: string,
    action: 'mute' | 'remove',
    reason: string,
  ) {
    const { meeting } = await this.host(businessId, actorUserId, id);
    assertMeetingJoinWindow(meeting);
    const target = await this.prisma.voiceMeetingParticipant.findFirst({
      where: { id: participantId, businessId, meetingId: id, role: 'guest' },
    });
    if (!target) throw this.invalid('Guest participant not found.');
    if (action === 'remove') {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM voice_video_meetings WHERE id = ${id} FOR UPDATE`;
        await tx.voiceMeetingParticipant.update({
          where: { id: target.id },
          data: {
            admission: 'revoked',
            decidedByUserId: actorUserId,
            decisionReason: reason.trim(),
          },
        });
        await this.audit(
          tx,
          businessId,
          actorUserId,
          id,
          'voice.meeting.guest_removal_requested',
          { participantId, reason: reason.trim() },
        );
      });
    }
    let providerRequest: 'accepted' | 'pending' = 'pending';
    try {
      const client = this.roomClient();
      if (action === 'remove')
        await client.removeParticipant(`voice-meeting-${id}`, target.identity, {
          revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)),
        });
      else {
        const person = (
          await client.listParticipants(`voice-meeting-${id}`)
        ).find((p) => p.identity === target.identity);
        if (!person) throw this.invalid('This guest is not connected.');
        const microphones = person.tracks.filter(
          (t) => t.source === TrackSource.MICROPHONE,
        );
        if (!microphones.length)
          throw this.invalid('This guest has no published microphone to mute.');
        for (const track of microphones)
          await client.mutePublishedTrack(
            `voice-meeting-${id}`,
            target.identity,
            track.sid,
            true,
          );
      }
      providerRequest = 'accepted';
    } catch (error) {
      if (action === 'mute') throw this.providerError(error);
      // Admission is revoked even if the provider is down; do not invent a disconnect receipt.
    }
    await this.prisma.auditLog.create({
      data: {
        businessId,
        actorUserId,
        entity: 'VoiceVideoMeeting',
        entityId: id,
        action: `voice.meeting.${action}_provider_request`,
        after: { participantId, providerRequest, reason: reason.trim() },
      },
    });
    return {
      action,
      providerRequest,
      message:
        providerRequest === 'accepted'
          ? 'The provider accepted the control request. Connection state still follows provider receipts.'
          : 'New joins are blocked; the provider disconnect remains pending. Existing short-lived tokens may remain valid until expiry.',
    };
  }

  async end(
    businessId: string,
    actorUserId: string,
    id: string,
    reason: string,
  ) {
    const { meeting } = await this.host(businessId, actorUserId, id);
    if (meeting.status === 'ended') return { status: 'ended' };
    if (meeting.status !== 'scheduled')
      throw this.invalid('This meeting cannot be ended.');
    this.requireConfig();
    await this.prisma.$transaction(async (tx) => {
      await tx.voiceVideoMeeting.update({
        where: { id },
        data: {
          roomState: 'ending',
          endRequestedAt: meeting.endRequestedAt ?? new Date(),
        },
      });
      await this.audit(
        tx,
        businessId,
        actorUserId,
        id,
        'voice.meeting.end_requested',
        { reason: reason.trim() },
      );
    });
    try {
      await this.roomClient().deleteRoom(`voice-meeting-${id}`);
      if (
        (await this.roomClient().listRooms([`voice-meeting-${id}`])).length ===
        0
      ) {
        await this.prisma.voiceVideoMeeting.update({
          where: { id },
          data: { status: 'ended', roomState: 'ended' },
        });
      }
    } catch {
      /* End remains pending, never falsely marked complete. */
    }
    return {
      status: (
        await this.prisma.voiceVideoMeeting.findUniqueOrThrow({ where: { id } })
      ).roomState,
    };
  }

  async revokeInviteParticipant(
    businessId: string,
    actorUserId: string,
    inviteId: string,
  ) {
    const row = await this.prisma.voiceMeetingParticipant.findFirst({
      where: { businessId, inviteId },
    });
    if (!row) return;
    await this.prisma.voiceMeetingParticipant.update({
      where: { id: row.id },
      data: {
        admission: 'revoked',
        decidedByUserId: actorUserId,
        decisionReason: 'Personal invitation revoked',
      },
    });
    let providerRequest = 'pending';
    try {
      await this.roomClient().removeParticipant(
        `voice-meeting-${row.meetingId}`,
        row.identity,
        { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) },
      );
      providerRequest = 'accepted';
    } catch {
      /* Short token TTL bounds stale grants; do not report disconnect as confirmed. */
    }
    await this.prisma.auditLog.create({
      data: {
        businessId,
        actorUserId,
        entity: 'VoiceVideoMeeting',
        entityId: row.meetingId,
        action: 'voice.meeting.invite_disconnect_requested',
        after: { participantId: row.id, providerRequest },
      },
    });
  }

  /** Safe idempotent recovery after an ending/cancellation provider request was not confirmed. */
  async reconcileClosures(businessId?: string, meetingId?: string) {
    if (!liveKitVideoConfig(this.config)) return;
    const meetings = await this.prisma.voiceVideoMeeting.findMany({
      where: {
        endRequestedAt: { not: null },
        roomState: 'ending',
        ...(businessId ? { businessId } : {}),
        ...(meetingId ? { id: meetingId } : {}),
      },
      orderBy: [{ endRequestedAt: 'asc' }, { id: 'asc' }],
      take: 20,
    });
    for (const meeting of meetings) {
      try {
        const roomName = `voice-meeting-${meeting.id}`;
        const client = this.roomClient();
        if ((await client.listRooms([roomName])).length)
          await client.deleteRoom(roomName);
        if ((await client.listRooms([roomName])).length === 0) {
          await this.prisma.$transaction(async (tx) => {
            await tx.voiceVideoMeeting.update({
              where: { id: meeting.id },
              data: {
                roomState: 'ended',
                ...(meeting.status === 'cancelled' ? {} : { status: 'ended' }),
              },
            });
            await this.audit(
              tx,
              meeting.businessId,
              null,
              meeting.id,
              'voice.meeting.room_closed_confirmed',
              { source: 'livekit_room_lookup' },
            );
          });
        }
      } catch {
        /* Keep the request pending for the next bounded recovery tick. */
      }
    }
  }

  async providerEvent(event: WebhookEvent) {
    await this.recordings?.providerEvent(event);
    const roomName = event.room?.name;
    if (!roomName?.startsWith('voice-meeting-')) return;
    const meeting = await this.prisma.voiceVideoMeeting.findUnique({
      where: { id: roomName.slice(14) },
    });
    const seconds = Number(event.createdAt);
    if (
      !meeting ||
      !event.id ||
      !Number.isSafeInteger(seconds) ||
      seconds <= 0 ||
      seconds * 1000 > Date.now() + 300_000
    )
      return;
    const at = new Date(seconds * 1000);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM voice_video_meetings WHERE id = ${meeting.id} FOR UPDATE`;
      const current = await tx.voiceVideoMeeting.findUniqueOrThrow({
        where: { id: meeting.id },
      });
      if (['room_started', 'room_finished'].includes(event.event)) {
        await tx.voiceUsageRecord.upsert({
          where: {
            businessId_eventKey: {
              businessId: meeting.businessId,
              eventKey: `livekit:event:${event.id}`,
            },
          },
          update: {},
          create: {
            businessId: meeting.businessId,
            eventKey: `livekit:event:${event.id}`,
            provider: 'noxtill',
            unit: 'video_provider_event',
            quantity: 0,
            state: 'observed',
            measuredAt: at,
            evidence: {
              meetingId: meeting.id,
              event: event.event,
              providerTimestamp: seconds,
              source: 'signed_livekit_webhook',
            },
          },
        });
      }
      if (
        event.event === 'room_finished' &&
        (!current.providerEventAt || at >= current.providerEventAt)
      ) {
        await tx.voiceVideoMeeting.update({
          where: { id: meeting.id },
          data: {
            roomState: 'ended',
            status: current.status === 'cancelled' ? 'cancelled' : 'ended',
            endedAt: at,
            providerEventAt: at,
          },
        });
      } else if (
        event.event === 'room_started' &&
        current.status === 'scheduled' &&
        !current.endRequestedAt &&
        (!current.providerEventAt || at > current.providerEventAt)
      ) {
        await tx.voiceVideoMeeting.update({
          where: { id: meeting.id },
          data: { roomState: 'active', providerEventAt: at },
        });
      }
      const p = event.participant;
      if (
        !p ||
        !['participant_joined', 'participant_left'].includes(event.event)
      )
        return;
      const row = await tx.voiceMeetingParticipant.findFirst({
        where: {
          businessId: meeting.businessId,
          meetingId: meeting.id,
          identity: p.identity,
        },
      });
      if (!row || (row.providerEventAt && at < row.providerEventAt)) return;
      if (
        event.event === 'participant_joined' &&
        row.providerLeftAt &&
        at <= row.providerLeftAt
      )
        return;
      if (
        event.event === 'participant_left' &&
        row.providerSid &&
        row.providerSid !== p.sid
      )
        return;
      await tx.voiceMeetingParticipant.update({
        where: { id: row.id },
        data: {
          providerSid: p.sid,
          providerEventAt: at,
          ...(event.event === 'participant_joined'
            ? { providerJoinedAt: at, providerLeftAt: null }
            : { providerLeftAt: at }),
        },
      });
    });
    if (
      event.event === 'room_started' &&
      (meeting.endRequestedAt || meeting.status !== 'scheduled')
    ) {
      try {
        await this.roomClient().deleteRoom(roomName);
      } catch {
        /* Existing ending request is recovered by the worker. */
      }
    }
    if (event.event === 'participant_joined' && event.participant) {
      const row = await this.prisma.voiceMeetingParticipant.findFirst({
        where: {
          businessId: meeting.businessId,
          meetingId: meeting.id,
          identity: event.participant.identity,
        },
        include: { invite: true },
      });
      if (
        meeting.endRequestedAt ||
        meeting.status !== 'scheduled' ||
        !row ||
        row.admission !== 'admitted' ||
        (row.role === 'guest' &&
          (!row.invite ||
            row.invite.revokedAt ||
            row.invite.expiresAt <= new Date()))
      ) {
        try {
          await this.roomClient().removeParticipant(
            roomName,
            event.participant.identity,
            { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) },
          );
        } catch {
          /* Never relabel a provider receipt as an authorized join. */
        }
      }
    }
  }

  recordingConfigured() {
    return this.recordings?.configured() ?? false;
  }

  recordingPolicies(businessId: string) {
    return (
      this.recordings?.recordingPolicies(businessId) ?? Promise.resolve([])
    );
  }

  private async providerParticipants(id: string) {
    try {
      return await this.roomClient().listParticipants(`voice-meeting-${id}`);
    } catch (error) {
      throw this.providerError(error);
    }
  }

  private async mint(
    meeting: VoiceVideoMeeting,
    identity: string,
    name: string,
    role: 'host' | 'guest',
    actorUserId: string | null,
  ) {
    const cfg = this.requireConfig();
    // Admission is re-checked under the same meeting mutex immediately before token issuance.
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM voice_video_meetings WHERE id = ${meeting.id} FOR UPDATE`;
      const current = await tx.voiceVideoMeeting.findUniqueOrThrow({
        where: { id: meeting.id },
      });
      assertMeetingJoinWindow(current);
      const participant = await tx.voiceMeetingParticipant.findUniqueOrThrow({
        where: { meetingId_identity: { meetingId: meeting.id, identity } },
        include: { invite: true },
      });
      if (
        participant.admission !== 'admitted' ||
        (participant.role === 'guest' &&
          (!participant.invite ||
            participant.invite.revokedAt ||
            participant.invite.expiresAt <= new Date()))
      )
        throw this.invalid('This participant is not admitted.');
      if (role === 'guest') {
        const recording = await tx.voiceVideoRecording.findFirst({
          where: {
            businessId: meeting.businessId,
            meetingId: meeting.id,
            status: {
              in: [
                'consent_pending',
                'starting',
                'recording',
                'stopping',
                'processing',
              ],
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: { consents: { where: { identity }, take: 1 } },
        });
        if (
          recording &&
          recording.status !== 'stopping' &&
          recording.status !== 'processing' &&
          recording.consents[0]?.decision !== 'granted'
        )
          throw new AppException(
            'VOICE_MEETING_RECORDING_CONSENT_REQUIRED',
            'Read and accept the meeting recording notice before joining.',
            HttpStatus.CONFLICT,
          );
        if (recording && ['stopping', 'processing'].includes(recording.status))
          throw new AppException(
            'VOICE_MEETING_RECORDING_STOPPING',
            'New joins are paused while the recording is stopping.',
            HttpStatus.CONFLICT,
          );
      }
      const roomName = `voice-meeting-${meeting.id}`;
      const ttl = Math.min(
        60,
        Math.floor(
          (current.scheduledAt.getTime() +
            (current.durationMin + 60) * 60_000 -
            Date.now()) /
            1000,
        ),
      );
      if (ttl < 1) throw this.invalid('This meeting join window ended.');
      const access = new AccessToken(cfg.apiKey, cfg.apiSecret, {
        identity,
        name: name.slice(0, 120),
        ttl,
      });
      access.addGrant({
        room: roomName,
        roomJoin: true,
        canSubscribe: true,
        canPublish: true,
        canPublishSources:
          role === 'host'
            ? [
                TrackSource.CAMERA,
                TrackSource.MICROPHONE,
                TrackSource.SCREEN_SHARE,
                TrackSource.SCREEN_SHARE_AUDIO,
              ]
            : [TrackSource.CAMERA, TrackSource.MICROPHONE],
        canPublishData: false,
        roomRecord: false,
        roomAdmin: false,
      });
      await this.audit(
        tx,
        meeting.businessId,
        actorUserId,
        meeting.id,
        'voice.meeting.join_token_issued',
        { participantId: participant.id, role, ttlSeconds: ttl },
      );
      return {
        url: cfg.url,
        token: await access.toJwt(),
        roomName,
        meetingId: meeting.id,
        role,
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
        screenShare: role === 'host',
        recording: 'not_available' as const,
      };
    });
  }

  private providerError(error: unknown) {
    return error instanceof AppException
      ? error
      : new AppException(
          'VOICE_VIDEO_PROVIDER_UNAVAILABLE',
          'The live video provider could not confirm the room state. Try again or ask the host.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
  }
  private invalid(message: string) {
    return new AppException(
      VOICE_ERROR_CODES.MEETING_INVALID,
      message,
      HttpStatus.CONFLICT,
    );
  }
}
