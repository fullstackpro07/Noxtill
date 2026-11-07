import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  S3Upload,
  type EgressInfo,
  type WebhookEvent,
} from 'livekit-server-sdk';
import { Prisma } from '@prisma/client';
import { S3Service } from '../common/storage/s3.service';
import { AppException } from '../common/filters/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertMeetingJoinWindow,
  liveKitVideoConfig,
} from './voice-meeting-access.util';

const ACTIVE_RECORDING = [
  'consent_pending',
  'starting',
  'recording',
  'stopping',
  'processing',
];

/** Consent, Egress, private storage confirmation and retention for meeting video. */
@Injectable()
export class VoiceVideoRecordingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly s3: S3Service,
  ) {}

  protected egressClient() {
    const cfg = liveKitVideoConfig(this.config);
    if (!cfg) throw this.notConfigured();
    return new EgressClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret, {
      requestTimeout: 10,
    });
  }

  configured() {
    return Boolean(
      liveKitVideoConfig(this.config) &&
      this.s3.storageMode() === 's3' &&
      this.config.get<string>('S3_BUCKET') &&
      this.config.get<string>('S3_ACCESS_KEY_ID') &&
      this.config.get<string>('S3_SECRET_ACCESS_KEY'),
    );
  }

  async recordingPolicies(businessId: string) {
    const versions = await this.prisma.voiceCompliancePolicyVersion.findMany({
      where: {
        businessId,
        status: 'published',
        recordingAllowed: true,
        recordingNoticeText: { not: null },
        recordingRetentionDays: { not: null },
        pack: { businessId, disabledAt: null },
      },
      include: {
        pack: {
          select: { countryCode: true, purpose: true, callerType: true },
        },
      },
      orderBy: [{ pack: { countryCode: 'asc' } }, { version: 'desc' }],
      take: 100,
    });
    return versions.map((row) => ({
      id: row.id,
      version: row.version,
      countryCode: row.pack.countryCode,
      purpose: row.pack.purpose,
      callerType: row.pack.callerType,
      notice: [
        row.recordingNoticeText!.trim(),
        row.meetingAiProcessingAllowed
          ? row.meetingAiProcessingNoticeText?.trim()
          : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join('\n\n'),
      retentionDays: row.recordingRetentionDays!,
      aiProcessingAllowed: row.meetingAiProcessingAllowed,
      aiProcessingNotice: row.meetingAiProcessingNoticeText,
    }));
  }

  async startConsent(
    businessId: string,
    actorUserId: string,
    meetingId: string,
    accepted: boolean,
  ) {
    const meeting = await this.meetingHost(businessId, actorUserId, meetingId);
    if (!accepted)
      throw this.invalid(
        'Recording cannot be prepared without the host accepting its notice.',
      );
    if (!this.configured()) throw this.notConfigured();
    if (
      meeting.status !== 'scheduled' ||
      meeting.roomState !== 'active' ||
      meeting.endRequestedAt
    )
      throw this.invalid(
        'The meeting must be active before recording can be prepared.',
      );
    if (!meeting.recordingPolicyVersionId)
      throw this.invalid(
        'Choose a published regional recording policy before starting a recording.',
      );
    const policy = await this.prisma.voiceCompliancePolicyVersion.findFirst({
      where: {
        id: meeting.recordingPolicyVersionId,
        businessId,
        status: 'published',
        recordingAllowed: true,
        recordingNoticeText: { not: null },
        recordingRetentionDays: { not: null },
        pack: { businessId, disabledAt: null },
      },
      include: { pack: { select: { countryCode: true } } },
    });
    const retentionDays = policy?.recordingRetentionDays;
    if (
      !policy?.recordingNoticeText ||
      retentionDays == null ||
      retentionDays < 1
    )
      throw this.invalid(
        'The selected published policy no longer permits recording or has no retention period.',
      );

    const roomName = `voice-meeting-${meetingId}`;
    let providerParticipants: Array<{ identity: string }>;
    try {
      providerParticipants = await this.roomClient().listParticipants(roomName);
    } catch {
      throw this.providerUnavailable(
        'LiveKit could not confirm the current participants.',
      );
    }
    const hostIdentity = `host:${meeting.hostBusinessUserId}`;
    if (!providerParticipants.some((p) => p.identity === hostIdentity))
      throw this.invalid(
        'The assigned host must be connected before recording is prepared.',
      );

    const people = await this.prisma.voiceMeetingParticipant.findMany({
      where: { businessId, meetingId },
      include: {
        invite: {
          select: { guestName: true, revokedAt: true, expiresAt: true },
        },
      },
    });
    const byIdentity = new Map(
      people.map((person) => [person.identity, person]),
    );
    const connected = providerParticipants.map((providerPerson) => {
      const row = byIdentity.get(providerPerson.identity);
      if (!row || row.admission !== 'admitted')
        throw this.invalid(
          'A connected participant is not represented by an admitted meeting invite.',
        );
      if (
        row.role === 'guest' &&
        (!row.invite ||
          row.invite.revokedAt ||
          row.invite.expiresAt <= new Date())
      )
        throw this.invalid(
          'A connected guest invitation is expired or revoked.',
        );
      return row;
    });
    const now = new Date();
    if (
      policy.meetingAiProcessingAllowed &&
      !policy.meetingAiProcessingNoticeText?.trim()
    )
      throw this.invalid(
        'The selected policy enables AI processing but has no approved AI notice.',
      );
    const aiProcessingNotice = policy.meetingAiProcessingAllowed
      ? policy.meetingAiProcessingNoticeText!.trim()
      : null;
    const notice = [policy.recordingNoticeText.trim(), aiProcessingNotice]
      .filter((value): value is string => Boolean(value))
      .join('\n\n');
    const noticeHash = createHash('sha256').update(notice).digest('hex');
    const expiresAt = new Date(now.getTime() + retentionDays * 86_400_000);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM voice_video_meetings WHERE id = ${meetingId} AND business_id = ${businessId} FOR UPDATE`;
      const current = await tx.voiceVideoMeeting.findFirst({
        where: { id: meetingId, businessId },
      });
      if (
        !current ||
        current.status !== 'scheduled' ||
        current.roomState !== 'active' ||
        current.endRequestedAt
      )
        throw this.invalid(
          'The meeting state changed. Refresh before preparing recording.',
        );
      const existing = await tx.voiceVideoRecording.findFirst({
        where: { businessId, meetingId, status: { in: ACTIVE_RECORDING } },
        select: { id: true },
      });
      if (existing)
        throw this.invalid(
          'A recording session is already open for this meeting.',
        );
      const recording = await tx.voiceVideoRecording.create({
        data: {
          businessId,
          meetingId,
          policyVersionId: policy.id,
          startedByUserId: actorUserId,
          status: 'consent_pending',
          noticeSnapshot: notice,
          noticeHash,
          aiProcessingAllowed: policy.meetingAiProcessingAllowed,
          aiProcessingNoticeSnapshot: aiProcessingNotice,
          regionCode: policy.pack.countryCode,
          retentionDays,
          retentionExpiresAt: expiresAt,
        },
      });
      await tx.voiceVideoRecordingConsent.createMany({
        data: connected.map((person) => ({
          businessId,
          recordingId: recording.id,
          participantId: person.id,
          identity: person.identity,
          role: person.role,
          decision: person.identity === hostIdentity ? 'granted' : 'pending',
          noticeSnapshot: notice,
          noticeHash,
          source:
            person.identity === hostIdentity
              ? 'host_confirmation'
              : 'meeting_room',
          decidedAt: person.identity === hostIdentity ? now : null,
        })),
      });
      await this.audit(
        tx,
        businessId,
        actorUserId,
        meetingId,
        'voice.meeting.recording_consent_opened',
        {
          recordingId: recording.id,
          policyVersionId: policy.id,
          regionCode: policy.pack.countryCode,
          noticeHash,
          hostAccepted: true,
          participantCount: connected.length,
        },
      );
      return this.recordingSummary(recording, connected.length - 1);
    });
  }

  async guestConsent(token: string, recordingId: string, accepted: boolean) {
    const invite = await this.findInvite(token);
    const recording = await this.prisma.voiceVideoRecording.findFirst({
      where: {
        id: recordingId,
        businessId: invite.businessId,
        meetingId: invite.meetingId,
        status: { in: ['consent_pending', 'starting', 'recording'] },
      },
    });
    if (!recording)
      throw this.invalid(
        'There is no active recording consent request for this invite.',
      );
    const participant = await this.prisma.voiceMeetingParticipant.findUnique({
      where: { inviteId: invite.id },
    });
    if (!participant || participant.admission !== 'admitted')
      throw this.invalid('This invitation has not been admitted.');
    const decision = accepted ? 'granted' : 'declined';
    const now = new Date();
    const shouldStop =
      !accepted && ['starting', 'recording'].includes(recording.status);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM voice_video_meetings WHERE id = ${invite.meetingId} FOR UPDATE`;
      const existing = await tx.voiceVideoRecordingConsent.findUnique({
        where: {
          recordingId_identity: { recordingId, identity: participant.identity },
        },
      });
      if (existing?.decision === 'granted' && !accepted) {
        await tx.voiceVideoRecordingConsent.update({
          where: { id: existing.id },
          data: {
            decision: 'revoked',
            revokedAt: now,
            decidedAt: now,
            source: 'guest_withdrawal',
          },
        });
      } else if (existing?.decision === 'pending') {
        await tx.voiceVideoRecordingConsent.update({
          where: { id: existing.id },
          data: { decision, decidedAt: now, source: 'guest_invite' },
        });
      } else if (!existing) {
        await tx.voiceVideoRecordingConsent.create({
          data: {
            businessId: invite.businessId,
            recordingId,
            participantId: participant.id,
            identity: participant.identity,
            role: 'guest',
            decision,
            noticeSnapshot: recording.noticeSnapshot,
            noticeHash: recording.noticeHash,
            source: 'guest_invite',
            decidedAt: now,
          },
        });
      } else if (existing.decision !== decision) {
        throw this.invalid(
          'This recording decision is already final. Contact the host if it needs correction.',
        );
      }
      if (shouldStop)
        await tx.voiceVideoRecording.update({
          where: { id: recordingId },
          data: { status: 'stopping', stopRequestedAt: now },
        });
      else if (!accepted && recording.status === 'consent_pending')
        await tx.voiceVideoRecording.update({
          where: { id: recordingId },
          data: { status: 'declined' },
        });
      await this.audit(
        tx,
        invite.businessId,
        null,
        invite.meetingId,
        accepted
          ? 'voice.meeting.recording_consent_granted'
          : 'voice.meeting.recording_consent_declined_or_revoked',
        {
          recordingId,
          participantId: participant.id,
          noticeHash: recording.noticeHash,
        },
      );
    });
    if (shouldStop)
      await this.requestStop(
        recordingId,
        'A guest withdrew recording consent.',
      );
    return {
      accepted,
      status: shouldStop
        ? 'stopping'
        : accepted
          ? 'consent_recorded'
          : 'declined',
    };
  }

  async canGuestJoin(businessId: string, meetingId: string, inviteId: string) {
    const recording = await this.prisma.voiceVideoRecording.findFirst({
      where: { businessId, meetingId, status: { in: ACTIVE_RECORDING } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        consents: { where: { identity: `guest:${inviteId}` }, take: 1 },
      },
    });
    if (!recording) return { allowed: true as const, consent: null };
    if (recording.status === 'stopping' || recording.status === 'processing')
      return {
        allowed: false as const,
        consent: {
          recordingId: recording.id,
          status: 'stopping',
          notice: recording.noticeSnapshot,
        },
      };
    const consent = recording.consents[0];
    if (consent?.decision === 'granted')
      return {
        allowed: true as const,
        consent: {
          recordingId: recording.id,
          status: 'granted',
          notice: recording.noticeSnapshot,
        },
      };
    return {
      allowed: false as const,
      consent: {
        recordingId: recording.id,
        status: consent?.decision ?? 'required',
        notice: recording.noticeSnapshot,
      },
    };
  }

  async activeGuestConsent(
    businessId: string,
    meetingId: string,
    inviteId: string,
  ) {
    const recording = await this.prisma.voiceVideoRecording.findFirst({
      where: { businessId, meetingId, status: { in: ACTIVE_RECORDING } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        consents: { where: { identity: `guest:${inviteId}` }, take: 1 },
      },
    });
    if (!recording) return null;
    return {
      recordingId: recording.id,
      status: recording.consents[0]?.decision ?? 'required',
      notice: recording.noticeSnapshot,
    };
  }

  async start(businessId: string, actorUserId: string, meetingId: string) {
    const meeting = await this.meetingHost(businessId, actorUserId, meetingId);
    if (!this.configured()) throw this.notConfigured();
    if (
      meeting.status !== 'scheduled' ||
      meeting.roomState !== 'active' ||
      meeting.endRequestedAt
    )
      throw this.invalid('The meeting is not in a recordable active state.');
    const recording = await this.prisma.voiceVideoRecording.findFirst({
      where: { businessId, meetingId, status: 'consent_pending' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!recording)
      throw this.invalid(
        'Open a recording consent request before starting Egress.',
      );
    const online = await this.safeListParticipants(meetingId);
    const identities = new Set(online.map((person) => person.identity));
    if (!identities.has(`host:${meeting.hostBusinessUserId}`))
      throw this.invalid('The assigned host must still be connected.');
    const participantRows = await this.prisma.voiceMeetingParticipant.findMany({
      where: {
        businessId,
        meetingId,
        identity: { in: [...identities] },
        admission: 'admitted',
      },
      include: { invite: true },
    });
    if (participantRows.length !== identities.size)
      throw this.invalid(
        'A connected participant no longer has a valid admitted record.',
      );
    if (
      participantRows.some(
        (person) =>
          person.role === 'guest' &&
          (!person.invite ||
            person.invite.revokedAt ||
            person.invite.expiresAt <= new Date()),
      )
    )
      throw this.invalid('A connected guest invitation is expired or revoked.');
    const consents = await this.prisma.voiceVideoRecordingConsent.findMany({
      where: {
        businessId,
        recordingId: recording.id,
        identity: { in: [...identities] },
      },
    });
    if (
      consents.length !== identities.size ||
      consents.some((consent) => consent.decision !== 'granted')
    )
      throw this.invalid(
        'Every connected participant must accept the recording notice before recording starts.',
      );
    const s3 = this.s3Config();
    const storageKey = `voice-video/${businessId}/${meetingId}/${recording.id}.mp4`;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM voice_video_meetings WHERE id = ${meetingId} AND business_id = ${businessId} FOR UPDATE`;
      const current = await tx.voiceVideoRecording.findFirst({
        where: { id: recording.id, businessId, status: 'consent_pending' },
      });
      if (!current)
        throw this.invalid(
          'The recording consent session changed. Refresh and try again.',
        );
      await tx.voiceVideoRecording.update({
        where: { id: recording.id },
        data: { status: 'starting', storageKey },
      });
      await this.audit(
        tx,
        businessId,
        actorUserId,
        meetingId,
        'voice.meeting.recording_start_requested',
        { recordingId: recording.id, noticeHash: recording.noticeHash },
      );
    });
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: storageKey,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: s3.accessKey,
          secret: s3.secret,
          bucket: s3.bucket,
          region: s3.region,
          endpoint: s3.endpoint,
          forcePathStyle: s3.forcePathStyle,
          contentDisposition: 'attachment',
        }),
      },
    });
    let info: EgressInfo;
    try {
      info = await this.egressClient().startRoomCompositeEgress(
        `voice-meeting-${meetingId}`,
        { file: output },
        { layout: 'grid' },
      );
    } catch {
      await this.prisma.voiceVideoRecording.updateMany({
        where: { id: recording.id, status: 'starting' },
        data: {
          status: 'failed',
          failureCode: 'EGRESS_START_FAILED',
          failureMessage: 'LiveKit did not accept the recording request.',
        },
      });
      await this.prisma.auditLog.create({
        data: {
          businessId,
          actorUserId,
          entity: 'VoiceVideoRecording',
          entityId: recording.id,
          action: 'voice.meeting.recording_start_failed',
          after: { code: 'EGRESS_START_FAILED' },
        },
      });
      throw this.providerUnavailable(
        'LiveKit did not accept the recording request. Check Egress and S3 configuration.',
      );
    }
    // Provider acceptance is not file readiness. Persist the Egress id outside the provider
    // failure handler so a database/audit error cannot be mislabeled as a rejected Egress start.
    const current = await this.prisma.voiceVideoRecording.update({
      where: { id: recording.id },
      data: { egressId: info.egressId, status: 'starting' },
    });
    await this.prisma.auditLog.create({
      data: {
        businessId,
        actorUserId,
        entity: 'VoiceVideoRecording',
        entityId: recording.id,
        action: 'voice.meeting.recording_egress_accepted',
        after: { egressId: info.egressId, status: 'starting' },
      },
    });
    if (current.stopRequestedAt)
      await this.requestStop(
        recording.id,
        'A stop was requested while Egress was starting.',
      );
    return {
      id: recording.id,
      status: current.stopRequestedAt ? 'stopping' : 'starting',
      message:
        'The provider accepted the recording request; the signed Egress event and uploaded file must still be confirmed.',
    };
  }

  async stop(
    businessId: string,
    actorUserId: string,
    meetingId: string,
    reason: string,
  ) {
    const meeting = await this.meetingHost(businessId, actorUserId, meetingId);
    const recording = await this.prisma.voiceVideoRecording.findFirst({
      where: {
        businessId,
        meetingId,
        status: {
          in: ['consent_pending', 'starting', 'recording', 'stopping'],
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!recording) throw this.invalid('There is no active meeting recording.');
    if (recording.status === 'consent_pending') {
      await this.prisma.voiceVideoRecording.update({
        where: { id: recording.id },
        data: { status: 'cancelled', stopRequestedAt: new Date() },
      });
      await this.prisma.auditLog.create({
        data: {
          businessId,
          actorUserId,
          entity: 'VoiceVideoRecording',
          entityId: recording.id,
          action: 'voice.meeting.recording_consent_cancelled',
          after: { reason: reason.trim() },
        },
      });
      return { id: recording.id, status: 'cancelled' };
    }
    await this.markStopRequested(
      recording.id,
      businessId,
      actorUserId,
      meeting.id,
      reason,
    );
    await this.requestStop(recording.id, reason);
    return {
      id: recording.id,
      status: 'stopping',
      message: 'The stop request is pending provider confirmation.',
    };
  }

  async artifacts(businessId: string, meetingId: string, actorUserId?: string) {
    const meeting = await this.prisma.voiceVideoMeeting.findFirst({
      where: { id: meetingId, businessId },
    });
    if (!meeting) throw this.invalid('Meeting not found.');
    // Route capability protects managers/owners. The query stays tenant-scoped even for those roles.
    const recordings = await this.prisma.voiceVideoRecording.findMany({
      where: { businessId, meetingId },
      include: {
        consents: { orderBy: { createdAt: 'asc' } },
        meeting: { select: { customerId: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    const result: Array<{
      id: string;
      status: string;
      regionCode: string;
      startedAt: string | null;
      endedAt: string | null;
      finalizedAt: string | null;
      durationSeconds: string | null;
      sizeBytes: string | null;
      expiresAt: string;
      failureMessage: string | null;
      downloadUrl: string | null;
      aiProcessingAllowed: boolean;
      artifactStatus: string;
      transcriptText: string | null;
      generatedSummary: string | null;
      followUpDraft: string | null;
      artifactFailureMessage: string | null;
      confidence: 'not_calibrated' | null;
      customerLinked: boolean;
      followUpDraftCreated: boolean;
      consents: Array<{
        role: string;
        decision: string;
        source: string;
        decidedAt: string | null;
        revokedAt: string | null;
        noticeHash: string;
      }>;
    }> = [];
    if (actorUserId && recordings.length) {
      await this.prisma.auditLog.create({
        data: {
          businessId,
          actorUserId,
          entity: 'VoiceVideoMeeting',
          entityId: meetingId,
          action: 'voice.meeting.recording_artifacts_accessed',
          after: { recordingCount: recordings.length },
        },
      });
    }
    for (const row of recordings) {
      let downloadUrl: string | null = null;
      let status = row.status;
      let sizeBytes = row.sizeBytes;
      const withinRetention = row.retentionExpiresAt > new Date();
      if (row.status === 'ready' && row.storageKey && withinRetention) {
        try {
          const file = await this.s3.headObject(row.storageKey);
          if (!file) {
            status = 'processing';
          } else {
            sizeBytes = BigInt(file.sizeBytes);
            downloadUrl = await this.s3.getSignedDownloadUrl(
              row.storageKey,
              300,
            );
          }
        } catch {
          status = 'processing';
        }
      }
      result.push({
        id: row.id,
        status,
        regionCode: row.regionCode,
        startedAt: row.providerStartedAt?.toISOString() ?? null,
        endedAt: row.providerEndedAt?.toISOString() ?? null,
        finalizedAt: row.finalizedAt?.toISOString() ?? null,
        durationSeconds: row.durationSeconds?.toString() ?? null,
        sizeBytes: sizeBytes?.toString() ?? null,
        expiresAt: row.retentionExpiresAt.toISOString(),
        failureMessage: row.failureMessage,
        downloadUrl,
        aiProcessingAllowed: row.aiProcessingAllowed,
        artifactStatus: withinRetention ? row.artifactStatus : 'expired',
        transcriptText: withinRetention ? row.transcriptText : null,
        generatedSummary: withinRetention ? row.generatedSummary : null,
        followUpDraft: withinRetention ? row.followUpDraft : null,
        artifactFailureMessage: withinRetention
          ? row.artifactFailureMessage
          : null,
        confidence:
          row.generatedSummary && withinRetention ? 'not_calibrated' : null,
        customerLinked: Boolean(row.meeting.customerId),
        followUpDraftCreated: Boolean(
          row.meeting.customerId &&
          (await this.prisma.messageDraft.findFirst({
            where: {
              businessId,
              sourceMeetingId: meetingId,
              sourceKey: `meeting-ai-followup:${row.id}`,
            },
            select: { id: true },
          })),
        ),
        consents: row.consents.map((consent) => ({
          role: consent.role,
          decision: consent.decision,
          source: consent.source,
          decidedAt: consent.decidedAt?.toISOString() ?? null,
          revokedAt: consent.revokedAt?.toISOString() ?? null,
          noticeHash: consent.noticeHash,
        })),
      });
    }
    return {
      configured: this.configured(),
      recordings: result,
    };
  }

  async hostStatus(businessId: string, actorUserId: string, meetingId: string) {
    await this.meetingHost(businessId, actorUserId, meetingId);
    const recording = await this.prisma.voiceVideoRecording.findFirst({
      where: { businessId, meetingId },
      include: {
        consents: {
          include: {
            participant: {
              include: { invite: { select: { guestName: true } } },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return {
      configured: this.configured(),
      latest: recording
        ? {
            id: recording.id,
            status: recording.status,
            noticeSnapshot: recording.noticeSnapshot,
            aiProcessingAllowed: recording.aiProcessingAllowed,
            regionCode: recording.regionCode,
            retentionExpiresAt: recording.retentionExpiresAt.toISOString(),
            participants: recording.consents.map((consent) => ({
              participantId: consent.participantId,
              displayName:
                consent.role === 'host'
                  ? 'Assigned host'
                  : consent.participant?.invite?.guestName || 'Invited guest',
              role: consent.role,
              decision: consent.decision,
              decidedAt: consent.decidedAt?.toISOString() ?? null,
            })),
          }
        : null,
    };
  }

  async providerEvent(event: WebhookEvent) {
    if (
      !event.egressInfo ||
      !['egress_started', 'egress_updated', 'egress_ended'].includes(
        event.event,
      )
    )
      return false;
    const info = event.egressInfo;
    if (!info.egressId || !info.roomName?.startsWith('voice-meeting-'))
      return false;
    const meetingId = info.roomName.slice('voice-meeting-'.length);
    const recording = await this.prisma.voiceVideoRecording.findFirst({
      where: { meetingId, egressId: info.egressId },
    });
    const eventSeconds = Number(event.createdAt);
    if (
      !recording ||
      !event.id ||
      !Number.isSafeInteger(eventSeconds) ||
      eventSeconds <= 0 ||
      eventSeconds * 1000 > Date.now() + 300_000
    )
      return false;
    const at = new Date(eventSeconds * 1000);
    if (event.event === 'egress_ended')
      return this.finalizeFromProvider(recording.id, info, at, event.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM voice_video_meetings WHERE id = ${meetingId} FOR UPDATE`;
      await tx.voiceUsageRecord.upsert({
        where: {
          businessId_eventKey: {
            businessId: recording.businessId,
            eventKey: `livekit:event:${event.id}`,
          },
        },
        update: {},
        create: {
          businessId: recording.businessId,
          eventKey: `livekit:event:${event.id}`,
          provider: 'noxtill',
          unit: 'video_provider_event',
          quantity: 0,
          state: 'observed',
          measuredAt: at,
          evidence: {
            meetingId,
            recordingId: recording.id,
            egressId: info.egressId,
            event: event.event,
            source: 'signed_livekit_webhook',
          },
        },
      });
      const current = await tx.voiceVideoRecording.findUniqueOrThrow({
        where: { id: recording.id },
      });
      if (event.event === 'egress_started' && !current.providerStartedAt) {
        await tx.voiceVideoRecording.update({
          where: { id: current.id },
          data: {
            providerStartedAt: at,
            status: current.stopRequestedAt ? 'stopping' : 'recording',
          },
        });
        await this.audit(
          tx,
          current.businessId,
          null,
          current.meetingId,
          'voice.meeting.recording_started',
          {
            recordingId: current.id,
            egressId: info.egressId,
            providerEventId: event.id,
          },
        );
      }
    });
    return true;
  }

  async reconcile() {
    if (!this.configured()) return { checked: 0, finalized: 0, failed: 0 };
    const rows = await this.prisma.voiceVideoRecording.findMany({
      where: {
        status: { in: ['starting', 'stopping', 'processing'] },
        egressId: { not: null },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 30,
    });
    let finalized = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const jobs = await this.egressClient().listEgress({
          egressId: row.egressId!,
        });
        const info = jobs.find((job) => job.egressId === row.egressId);
        if (!info) continue;
        if (
          info.status === EgressStatus.EGRESS_ACTIVE &&
          row.status === 'starting'
        ) {
          await this.prisma.voiceVideoRecording.updateMany({
            where: { id: row.id, status: 'starting' },
            data: { status: 'recording' },
          });
        } else if (
          [
            EgressStatus.EGRESS_FAILED,
            EgressStatus.EGRESS_ABORTED,
            EgressStatus.EGRESS_LIMIT_REACHED,
          ].includes(info.status)
        ) {
          await this.prisma.voiceVideoRecording.updateMany({
            where: {
              id: row.id,
              status: {
                in: ['starting', 'recording', 'stopping', 'processing'],
              },
            },
            data: {
              status: 'failed',
              failureCode: 'EGRESS_FAILED',
              failureMessage: 'LiveKit could not complete this recording.',
            },
          });
          failed += 1;
        } else if (info.status === EgressStatus.EGRESS_COMPLETE) {
          const didFinalize = await this.finalizeFromProvider(
            row.id,
            info,
            null,
            `reconcile:${row.egressId}`,
          );
          if (didFinalize) finalized += 1;
        }
      } catch {
        // Keep the last known state; the next bounded job tick retries.
      }
    }
    return { checked: rows.length, finalized, failed };
  }

  async expireReadyRecordings(limit = 50) {
    const rows = await this.prisma.voiceVideoRecording.findMany({
      where: {
        status: 'ready',
        retentionExpiresAt: { lte: new Date() },
        storageKey: { not: null },
      },
      orderBy: [{ retentionExpiresAt: 'asc' }, { id: 'asc' }],
      take: Math.max(1, Math.min(100, limit)),
    });
    let deleted = 0;
    for (const row of rows) {
      try {
        await this.s3.delete(row.storageKey!);
        const deletedAt = new Date();
        const removed = await this.prisma.$transaction(async (tx) => {
          const result = await tx.voiceVideoRecording.updateMany({
            where: {
              id: row.id,
              businessId: row.businessId,
              status: 'ready',
              retentionExpiresAt: { lte: deletedAt },
            },
            data: {
              status: 'deleted',
              storageKey: null,
              transcriptText: null,
              generatedSummary: null,
              followUpDraft: null,
              artifactStatus: 'deleted',
              artifactsGeneratedAt: null,
              artifactFailureMessage: null,
            },
          });
          if (!result.count) return false;
          if (
            row.finalizedAt &&
            row.sizeBytes !== null &&
            row.sizeBytes >= 0n
          ) {
            const storedMilliseconds = Math.max(
              0,
              deletedAt.getTime() - row.finalizedAt.getTime(),
            );
            const byteDays = new Prisma.Decimal(row.sizeBytes.toString())
              .mul(storedMilliseconds)
              .div(86_400_000);
            await tx.voiceUsageRecord.upsert({
              where: {
                businessId_eventKey: {
                  businessId: row.businessId,
                  eventKey: `recording-storage:${row.id}`,
                },
              },
              update: {},
              create: {
                businessId: row.businessId,
                eventKey: `recording-storage:${row.id}`,
                provider: 'storage',
                unit: 'recording_storage_byte_days',
                quantity: byteDays,
                state: 'unpriced',
                measuredAt: deletedAt,
                evidence: {
                  source: 'confirmed_upload_to_successful_retention_deletion',
                  recordingId: row.id,
                  storedBytes: row.sizeBytes.toString(),
                  storedFrom: row.finalizedAt.toISOString(),
                  deletedAt: deletedAt.toISOString(),
                  providerInvoiceCostAvailable: false,
                },
              },
            });
          }
          await tx.messageDraft.deleteMany({
            where: {
              businessId: row.businessId,
              sourceMeetingId: row.meetingId,
              sourceKey: `meeting-ai-followup:${row.id}`,
              status: 'draft',
            },
          });
          await this.audit(
            tx,
            row.businessId,
            null,
            row.meetingId,
            'voice.meeting.recording_retention_deleted',
            {
              recordingId: row.id,
              retentionExpiresAt: row.retentionExpiresAt.toISOString(),
            },
          );
          return true;
        });
        if (removed) deleted += 1;
      } catch {
        // Leave the object reference intact so the next retention pass can retry.
      }
    }
    return { checked: rows.length, deleted };
  }

  async expireStaleConsentSessions(limit = 100) {
    const now = new Date();
    const rows = await this.prisma.voiceVideoRecording.findMany({
      where: { status: 'consent_pending' },
      include: {
        meeting: {
          select: {
            status: true,
            roomState: true,
            scheduledAt: true,
            durationMin: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: Math.max(1, Math.min(500, limit)),
    });
    let cancelled = 0;
    for (const row of rows) {
      const expectedEnd =
        row.meeting.scheduledAt.getTime() + row.meeting.durationMin * 60_000;
      const expired =
        row.meeting.status !== 'scheduled' ||
        row.meeting.roomState === 'ended' ||
        now.getTime() > expectedEnd + 60 * 60_000;
      if (!expired) continue;
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.voiceVideoRecording.updateMany({
          where: { id: row.id, status: 'consent_pending' },
          data: {
            status: 'cancelled',
            stopRequestedAt: now,
            failureCode: 'CONSENT_SESSION_EXPIRED',
            failureMessage:
              'Recording consent expired before the host started recording.',
          },
        });
        if (!updated.count) return;
        await this.audit(
          tx,
          row.businessId,
          null,
          row.meetingId,
          'voice.meeting.recording_consent_expired',
          { recordingId: row.id, expiredAt: now.toISOString() },
        );
        cancelled += 1;
      });
    }
    return { checked: rows.length, cancelled };
  }

  private async finalizeFromProvider(
    recordingId: string,
    info: EgressInfo,
    at: Date | null,
    providerEventId: string,
  ) {
    const row = await this.prisma.voiceVideoRecording.findUnique({
      where: { id: recordingId },
    });
    if (!row || !row.storageKey) return false;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM voice_video_meetings WHERE id = ${row.meetingId} FOR UPDATE`;
      await tx.voiceUsageRecord.upsert({
        where: {
          businessId_eventKey: {
            businessId: row.businessId,
            eventKey: `livekit:event:${providerEventId}`,
          },
        },
        update: {},
        create: {
          businessId: row.businessId,
          eventKey: `livekit:event:${providerEventId}`,
          provider: 'noxtill',
          unit: 'video_provider_event',
          quantity: 0,
          state: 'observed',
          measuredAt: at ?? new Date(),
          evidence: {
            meetingId: row.meetingId,
            recordingId,
            egressId: info.egressId,
            event: 'egress_ended',
            egressStatus: info.status,
            source: providerEventId.startsWith('reconcile:')
              ? 'authenticated_egress_lookup'
              : 'signed_livekit_webhook',
          },
        },
      });
      const current = await tx.voiceVideoRecording.findUniqueOrThrow({
        where: { id: recordingId },
      });
      if (current.providerEndedAt && current.status === 'ready') return;
      await tx.voiceVideoRecording.update({
        where: { id: recordingId },
        data: {
          status: 'processing',
          ...(current.providerEndedAt || !at ? {} : { providerEndedAt: at }),
        },
      });
      await this.audit(
        tx,
        row.businessId,
        null,
        row.meetingId,
        'voice.meeting.recording_provider_ended',
        {
          recordingId,
          egressId: info.egressId,
          egressStatus: info.status,
          providerEventId,
        },
      );
    });
    if (
      info.status !== EgressStatus.EGRESS_COMPLETE ||
      !info.fileResults?.length
    ) {
      await this.prisma.voiceVideoRecording.updateMany({
        where: { id: recordingId, status: 'processing' },
        data: {
          status: 'failed',
          failureCode: 'EGRESS_FILE_MISSING',
          failureMessage: info.error
            ? 'LiveKit reported a recording export error.'
            : 'LiveKit completed without a recording file.',
        },
      });
      return false;
    }
    const file = await this.s3.headObject(row.storageKey);
    if (!file) return false;
    const duration =
      at && row.providerStartedAt && row.providerStartedAt <= at
        ? BigInt(
            Math.floor((at.getTime() - row.providerStartedAt.getTime()) / 1000),
          )
        : null;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.voiceVideoRecording.updateMany({
        where: {
          id: recordingId,
          status: 'processing',
          storageKey: row.storageKey,
        },
        data: {
          status: 'ready',
          finalizedAt: new Date(),
          ...(at ? { providerEndedAt: at } : {}),
          durationSeconds: duration,
          sizeBytes: BigInt(file.sizeBytes),
          failureCode: null,
          failureMessage: null,
        },
      });
      if (updated.count)
        await this.audit(
          tx,
          row.businessId,
          null,
          row.meetingId,
          'voice.meeting.recording_ready',
          {
            recordingId,
            sizeBytes: file.sizeBytes,
            durationSeconds: duration?.toString() ?? null,
            objectVerified: true,
            providerEventId,
          },
        );
    });
    return true;
  }

  private async markStopRequested(
    recordingId: string,
    businessId: string,
    actorUserId: string,
    meetingId: string,
    reason: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.voiceVideoRecording.updateMany({
        where: {
          id: recordingId,
          status: { in: ['starting', 'recording', 'stopping'] },
        },
        data: { status: 'stopping', stopRequestedAt: new Date() },
      });
      await this.audit(
        tx,
        businessId,
        actorUserId,
        meetingId,
        'voice.meeting.recording_stop_requested',
        { recordingId, reason: reason.trim() },
      );
    });
  }

  private async requestStop(recordingId: string, reason: string) {
    const row = await this.prisma.voiceVideoRecording.findUnique({
      where: { id: recordingId },
    });
    if (!row || !row.egressId || row.status !== 'stopping') return;
    try {
      await this.egressClient().stopEgress(row.egressId);
      await this.prisma.auditLog.create({
        data: {
          businessId: row.businessId,
          entity: 'VoiceVideoRecording',
          entityId: row.id,
          action: 'voice.meeting.recording_provider_stop_accepted',
          after: { egressId: row.egressId, reason },
        },
      });
    } catch {
      // The state remains stopping until a signed callback or authenticated lookup confirms the outcome.
    }
  }

  private async meetingHost(
    businessId: string,
    actorUserId: string,
    meetingId: string,
  ) {
    const meeting = await this.prisma.voiceVideoMeeting.findFirst({
      where: { id: meetingId, businessId },
    });
    if (!meeting) throw this.invalid('Meeting not found.');
    const host = await this.prisma.businessUser.findFirst({
      where: {
        id: meeting.hostBusinessUserId,
        businessId,
        userId: actorUserId,
        active: true,
      },
    });
    if (!host)
      throw new AppException(
        'VOICE_MEETING_HOST_NOT_FOUND',
        'Only the assigned active host can control its recording.',
        HttpStatus.FORBIDDEN,
      );
    return meeting;
  }

  private async findInvite(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw this.invalid('Meeting invite is invalid or expired.');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invite = await this.prisma.voiceMeetingInvite.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        meeting: { status: 'scheduled', endRequestedAt: null },
      },
      include: { meeting: true },
    });
    if (!invite) throw this.invalid('Meeting invite is invalid or expired.');
    assertMeetingJoinWindow(invite.meeting);
    return invite;
  }

  private async safeListParticipants(
    meetingId: string,
  ): Promise<Array<{ identity: string }>> {
    try {
      return this.roomClient().listParticipants(`voice-meeting-${meetingId}`);
    } catch {
      throw this.providerUnavailable(
        'LiveKit could not confirm current room participants.',
      );
    }
  }

  protected roomClient() {
    const cfg = liveKitVideoConfig(this.config);
    if (!cfg) throw this.notConfigured();
    return new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret, {
      requestTimeout: 10,
    });
  }

  private s3Config() {
    const accessKey = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secret = this.config.get<string>('S3_SECRET_ACCESS_KEY');
    const bucket = this.config.get<string>('S3_BUCKET');
    if (this.s3.storageMode() !== 's3' || !accessKey || !secret || !bucket)
      throw this.notConfigured();
    return {
      accessKey,
      secret,
      bucket,
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      endpoint: this.config.get<string>('S3_ENDPOINT') ?? '',
      forcePathStyle: this.config.get<string>('S3_FORCE_PATH_STYLE') === 'true',
    };
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

  private recordingSummary(
    row: {
      id: string;
      status: string;
      regionCode: string;
      retentionExpiresAt: Date;
    },
    pending: number,
  ) {
    return {
      id: row.id,
      status: row.status,
      regionCode: row.regionCode,
      retentionExpiresAt: row.retentionExpiresAt.toISOString(),
      pendingConsentCount: pending,
      message: pending
        ? 'Recording has not started. Waiting for every connected participant to consent.'
        : 'Consent is saved. The host can start recording after checking the room.',
    };
  }

  private notConfigured() {
    return new AppException(
      'VOICE_VIDEO_RECORDING_NOT_CONFIGURED',
      'Meeting recording needs LiveKit Egress and private S3 storage configured on the server.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private providerUnavailable(message: string) {
    return new AppException(
      'VOICE_VIDEO_PROVIDER_UNAVAILABLE',
      message,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private invalid(message: string) {
    return new AppException(
      'VOICE_MEETING_INVALID',
      message,
      HttpStatus.CONFLICT,
    );
  }
}
