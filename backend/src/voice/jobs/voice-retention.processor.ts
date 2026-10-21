import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../common/storage/s3.service';
import { VoiceHumanAgentDispatchService } from '../voice-human-agent-dispatch.service';
import { VoiceTranscriptRedactionService } from '../voice-transcript-redaction.service';
import { VoiceOutboundDialerService } from '../voice-outbound-dialer.service';
import { VoiceCallReconciliationService } from '../voice-call-reconciliation.service';
import { VoiceRealtimeService } from '../voice-realtime.service';
import { AppException } from '../../common/filters/app.exception';
import { HttpStatus } from '@nestjs/common';
import { VoiceOperationsService } from '../voice-operations.service';
import { VoiceVideoRoomService } from '../voice-video-room.service';
import { VoiceVideoRecordingService } from '../voice-video-recording.service';
import { VoiceMeetingArtifactsService } from '../voice-meeting-artifacts.service';
import { VoiceUsageMeteringService } from '../voice-usage-metering.service';
import { VoiceProviderWebhookEventsService } from '../voice-provider-webhook-events.service';
import {
  VOICE_RETENTION_QUEUE,
  RECORDING_RETENTION_DAYS,
} from '../voice.constants';

interface CallTurn {
  recordingKey?: string;
}

/**
 * Daily recording/transcript purge (UPD-BE-059's "retention tied to Data & Privacy rules") — a
 * call and everything about it (transcript text, every turn's S3 recording) is deleted together
 * when its recorded policy expiry is reached, or after the default retention for legacy rows.
 * Live calls are never deleted. Runs outside any request context, same per-row try/catch
 * convention as every other background job in this app.
 */
@Processor(VOICE_RETENTION_QUEUE)
export class VoiceRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(VoiceRetentionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly humanAgentDispatch: VoiceHumanAgentDispatchService,
    private readonly transcriptRedaction?: VoiceTranscriptRedactionService,
    private readonly outboundDialer?: VoiceOutboundDialerService,
    @Optional()
    private readonly callReconciliation?: VoiceCallReconciliationService,
    @Optional() private readonly realtimeVoice?: VoiceRealtimeService,
    @Optional() private readonly operations?: VoiceOperationsService,
    @Optional() private readonly videoRooms?: VoiceVideoRoomService,
    @Optional() private readonly videoRecordings?: VoiceVideoRecordingService,
    @Optional()
    private readonly meetingArtifacts?: VoiceMeetingArtifactsService,
    @Optional()
    private readonly usageMetering?: VoiceUsageMeteringService,
    @Optional()
    private readonly providerWebhookEvents?: VoiceProviderWebhookEventsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'generate-video-ai-artifacts') {
      const data = job.data as { businessId: string; recordingId: string };
      if (!this.meetingArtifacts)
        throw new AppException(
          'VOICE_MEDIA_QUEUE_NOT_CONFIGURED',
          'Meeting artifact processing is unavailable.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      await this.meetingArtifacts.process(data.recordingId, data.businessId);
      return;
    }
    if (job.name === 'monitor-operations') {
      await this.operations?.checkAlerts();
      await this.videoRooms?.reconcileClosures();
      await this.videoRecordings?.reconcile();
      await this.meetingArtifacts?.recoverStaleProcessing();
      return;
    }
    if (job.name === 'import-realtime-recording') {
      const data = job.data as { callSid: string; recordingSid: string };
      if (!this.realtimeVoice)
        throw new AppException(
          'VOICE_MEDIA_QUEUE_NOT_CONFIGURED',
          'Recording processing is unavailable.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      await this.realtimeVoice.saveRecording(data.callSid, data.recordingSid);
      return;
    }
    if (job.name === 'expire-agent-reservations') {
      return this.releaseExpiredAgentReservations();
    }
    if (job.name === 'start-scheduled-campaigns') {
      const started = (await this.outboundDialer?.startDueScheduled()) ?? 0;
      if (started > 0) {
        this.logger.log(`Started ${started} scheduled outbound campaign(s)`);
      }
      return;
    }
    if (job.name === 'redact-transcripts') {
      const processed = (await this.transcriptRedaction?.runPending()) ?? 0;
      if (processed > 0) {
        this.logger.debug(`Redacted ${processed} finished call transcript(s)`);
      }
      return;
    }
    if (job.name === 'reconcile-orphaned-calls') {
      const result = await this.callReconciliation?.reconcileStaleCalls();
      if (result && result.checked > 0) {
        this.logger.debug(
          `Voice call reconciliation checked ${result.checked} stale call(s), closed ${result.reconciled}, failed ${result.failed}`,
        );
      }
      return;
    }
    if (job.name === 'retry-provider-webhook-events') {
      const result = await this.providerWebhookEvents?.retryDue();
      if (result && (result.attempted > 0 || result.deadLettered > 0)) {
        this.logger.debug(
          `Provider callback recovery attempted ${result.attempted} event(s), dead-lettered ${result.deadLettered}`,
        );
      }
      return;
    }
    if (job.name === 'tick') {
      await this.runPurge();
      await this.videoRecordings?.expireStaleConsentSessions();
      await this.videoRecordings?.expireReadyRecordings();
      await this.videoRecordings?.reconcile();
      return;
    }
  }

  async releaseExpiredAgentReservations(): Promise<void> {
    const result = await this.humanAgentDispatch.releaseExpiredOffers();
    if (result.count > 0) {
      this.logger.debug(
        `Released ${result.count} expired human-agent call reservation(s)`,
      );
    }
  }

  async runPurge(): Promise<void> {
    const now = new Date();
    const cutoff = new Date(
      now.getTime() - RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const expired = await this.prisma.phoneCall.findMany({
      where: {
        status: { not: 'in_progress' },
        // A legal hold suspends retention until it is released.
        legalHoldAt: null,
        OR: [
          { recordingExpiresAt: { lte: now } },
          {
            recordingExpiresAt: null,
            startedAt: { lt: cutoff },
          },
        ],
      },
    });

    let purged = 0;
    for (const call of expired) {
      try {
        const turns = (call.transcript as unknown as CallTurn[]) ?? [];
        const recordingKeys = new Set(
          [
            call.recordingKey,
            ...turns.map((turn) => turn.recordingKey ?? null),
          ].filter((key): key is string => Boolean(key)),
        );
        for (const recordingKey of recordingKeys) {
          await this.s3.delete(recordingKey);
          await this.usageMetering?.recordStorageRetention(
            call.businessId,
            call.id,
            recordingKey,
          );
        }
        await this.prisma.phoneCall.delete({ where: { id: call.id } });
        purged += 1;
      } catch (error) {
        this.logger.warn(
          `Voice retention purge failed for call ${call.id}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.debug(
      `Voice retention purge removed ${purged}/${expired.length} expired call(s)`,
    );
  }
}
