import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { SpeechToTextService } from '../ai/speech-to-text.service';
import { describeAiProviderFailure } from '../ai/ai-provider-error.util';
import { AppException } from '../common/filters/app.exception';
import { redactText } from './voice-redaction.util';
import { VOICE_RETENTION_QUEUE } from './voice.constants';

const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 80_000;

type GeneratedSummary = { summary: string; followUpDraft: string };

/** Consent-gated, bounded post-meeting processing. AI results remain review drafts, never sends. */
@Injectable()
export class VoiceMeetingArtifactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3Service,
    private readonly ai: AiInfraService,
    private readonly speechToText: SpeechToTextService,
    @InjectQueue(VOICE_RETENTION_QUEUE) private readonly queue: Queue,
  ) {}

  async request(
    businessId: string,
    actorUserId: string,
    meetingId: string,
    recordingId: string,
  ) {
    await this.assertHost(businessId, actorUserId, meetingId);
    const row = await this.prisma.voiceVideoRecording.findFirst({
      where: {
        id: recordingId,
        businessId,
        meetingId,
        status: 'ready',
        retentionExpiresAt: { gt: new Date() },
      },
      include: { consents: true },
    });
    if (!row)
      throw this.invalid('A confirmed, unexpired recording was not found.');
    if (!row.aiProcessingAllowed || !row.aiProcessingNoticeSnapshot?.trim())
      throw new AppException(
        'VOICE_MEETING_AI_CONSENT_REQUIRED',
        'This recording policy did not include an explicit AI transcription and summary notice.',
        HttpStatus.FORBIDDEN,
      );
    if (
      row.consents.length === 0 ||
      row.consents.some(
        (consent) => consent.decision !== 'granted' || consent.revokedAt,
      )
    )
      throw new AppException(
        'VOICE_MEETING_AI_CONSENT_REQUIRED',
        'Every recorded participant must have accepted the exact recording and AI-processing notice.',
        HttpStatus.FORBIDDEN,
      );
    if (!row.storageKey)
      throw this.invalid('The confirmed recording object is unavailable.');
    if (
      row.artifactStatus === 'ready' ||
      row.artifactStatus === 'queued' ||
      row.artifactStatus === 'processing'
    )
      return {
        recordingId,
        status: row.artifactStatus,
        message: 'Meeting processing is already available or underway.',
      };

    const claimed = await this.prisma.voiceVideoRecording.updateMany({
      where: {
        id: row.id,
        businessId,
        status: 'ready',
        artifactStatus: { in: ['not_requested', 'failed'] },
        retentionExpiresAt: { gt: new Date() },
      },
      data: {
        artifactStatus: 'queued',
        artifactFailureMessage: null,
      },
    });
    if (!claimed.count)
      return {
        recordingId,
        status: 'processing',
        message: 'Meeting processing is already underway.',
      };

    await this.prisma.auditLog.create({
      data: {
        businessId,
        actorUserId,
        entity: 'VoiceVideoRecording',
        entityId: row.id,
        action: 'voice.meeting.ai_artifacts_requested',
        after: { meetingId, noticeHash: row.noticeHash, status: 'queued' },
      },
    });
    try {
      await this.queue.add(
        'generate-video-ai-artifacts',
        { businessId, recordingId: row.id },
        { attempts: 1, removeOnComplete: 100, removeOnFail: 500 },
      );
    } catch {
      await this.markFailed(
        row.id,
        businessId,
        'Meeting processing could not be queued.',
      );
      throw new AppException(
        'VOICE_MEETING_ARTIFACTS_QUEUE_UNAVAILABLE',
        'Meeting processing could not be queued. Try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return {
      recordingId,
      status: 'queued',
      message:
        'Transcript and summary queued. Provider access and AI budget are checked during processing.',
    };
  }

  async process(recordingId: string, businessId: string) {
    const claimed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM voice_video_meetings WHERE id = (SELECT meeting_id FROM voice_video_recordings WHERE id = ${recordingId} AND business_id = ${businessId}) FOR UPDATE`;
      const row = await tx.voiceVideoRecording.findFirst({
        where: { id: recordingId, businessId, status: 'ready' },
        include: { consents: true, meeting: { select: { customerId: true } } },
      });
      if (
        !row ||
        row.artifactStatus !== 'queued' ||
        row.retentionExpiresAt <= new Date() ||
        !row.aiProcessingAllowed ||
        !row.aiProcessingNoticeSnapshot?.trim() ||
        !row.storageKey ||
        row.consents.length === 0 ||
        row.consents.some(
          (consent) => consent.decision !== 'granted' || consent.revokedAt,
        )
      )
        return null;
      await tx.voiceVideoRecording.update({
        where: { id: row.id },
        data: { artifactStatus: 'processing', artifactFailureMessage: null },
      });
      return row;
    });
    if (!claimed) return { status: 'skipped' as const };

    try {
      const object = await this.storage.headObject(claimed.storageKey!);
      if (!object)
        throw new Error('The private recording object could not be confirmed.');
      if (object.sizeBytes > MAX_TRANSCRIPTION_BYTES)
        throw new Error(
          'The recording exceeds the transcription provider size limit.',
        );
      const buffer = await this.storage.readObject(
        claimed.storageKey!,
        MAX_TRANSCRIPTION_BYTES,
      );
      if (!buffer || buffer.length === 0)
        throw new Error('The private recording object could not be read.');
      if (this.storage.storageMode() === 's3')
        await this.prisma.voiceUsageRecord.upsert({
          where: {
            businessId_eventKey: {
              businessId,
              eventKey: `storage:egress:meeting-transcription:${recordingId}`,
            },
          },
          update: {},
          create: {
            businessId,
            eventKey: `storage:egress:meeting-transcription:${recordingId}`,
            provider: 'storage',
            unit: 'recording_storage_egress_bytes',
            quantity: buffer.length,
            state: 'unpriced',
            evidence: {
              source: 'successfully_read_private_recording',
              purpose: 'consented_meeting_transcription',
              providerInvoiceCostAvailable: false,
            },
          },
        });
      await this.ai.checkGuardrails(businessId, 'voice_meeting_summary');
      const mimeType = object.contentType?.split(';')[0] || 'video/mp4';
      if (
        !['video/mp4', 'audio/mp4', 'video/webm', 'audio/webm'].includes(
          mimeType,
        )
      )
        throw new Error(
          'This recording format is not supported for transcription.',
        );

      let transcript = claimed.transcriptText;
      let redactions = 0;
      if (!transcript) {
        const transcription = await this.speechToText.transcribeWithMetrics(
          buffer,
          mimeType,
          `meeting-${recordingId}.${mimeType.includes('webm') ? 'webm' : 'mp4'}`,
        );
        const sanitized = redactText(transcription.text);
        transcript = sanitized.text.trim();
        redactions = sanitized.count;
        if (!transcript || transcript.length > MAX_TRANSCRIPT_CHARS)
          throw new Error(
            'The transcript is empty or exceeds the safe processing limit.',
          );
        await this.prisma.$transaction(async (tx) => {
          await tx.voiceVideoRecording.updateMany({
            where: {
              id: recordingId,
              businessId,
              artifactStatus: 'processing',
              retentionExpiresAt: { gt: new Date() },
            },
            data: { transcriptText: transcript },
          });
          if (
            transcription.audioSeconds !== null &&
            Number.isFinite(transcription.audioSeconds) &&
            transcription.audioSeconds > 0
          )
            await tx.voiceUsageRecord.upsert({
              where: {
                businessId_eventKey: {
                  businessId,
                  eventKey: `meeting-transcription-audio:${recordingId}`,
                },
              },
              update: {},
              create: {
                businessId,
                eventKey: `meeting-transcription-audio:${recordingId}`,
                provider: 'openai',
                unit: 'transcription_audio_seconds',
                quantity: transcription.audioSeconds,
                state: 'unpriced',
                evidence: {
                  source: 'openai_verbose_transcription_response',
                  model: 'whisper-1',
                  recordingId,
                  providerInvoiceCostAvailable: false,
                  unitIsMeasuredInputDurationNotCost: true,
                },
              },
            });
        });
      }

      await this.prisma.voiceUsageRecord.upsert({
        where: {
          businessId_eventKey: {
            businessId,
            eventKey: `meeting-transcription:${recordingId}`,
          },
        },
        update: {},
        create: {
          businessId,
          eventKey: `meeting-transcription:${recordingId}`,
          provider: 'openai',
          unit: 'meeting_transcription_bytes',
          quantity: object.sizeBytes,
          state: 'unpriced',
          evidence: {
            source: 'confirmed_private_recording_size',
            providerInvoiceCostAvailable: false,
            personalDataRedactedBeforeStorage: true,
          },
        },
      });

      const summaryInput = await this.ai.complete(
        businessId,
        [
          'Prepare a concise, factual meeting summary and an optional customer follow-up message using only the transcript below.',
          'Return only a JSON object with string fields "summary" and "followUpDraft". If no customer follow-up is appropriate, use an empty string.',
          'Do not infer facts, sentiment, intent, commitments, or outcomes not explicitly supported by the transcript.',
          'Do not include phone numbers, email addresses, payment-card data, or sensitive identity details.',
          'The follow-up is an unsent draft for human review. Never say it was sent or create a booking/task.',
          `Transcript:\n${transcript}`,
        ].join('\n\n'),
        0,
        'voice_meeting_summary',
        900,
      );
      const generated = this.parseSummary(summaryInput);
      const safeSummary = redactText(generated.summary);
      const safeDraft = redactText(generated.followUpDraft);
      redactions += safeSummary.count + safeDraft.count;
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM voice_video_meetings WHERE id = (SELECT meeting_id FROM voice_video_recordings WHERE id = ${recordingId} AND business_id = ${businessId}) FOR UPDATE`;
        const consentCheck = await tx.voiceVideoRecording.findFirst({
          where: {
            id: recordingId,
            businessId,
            status: 'ready',
            artifactStatus: 'processing',
            retentionExpiresAt: { gt: new Date() },
            aiProcessingAllowed: true,
          },
          include: { consents: true },
        });
        if (
          !consentCheck ||
          !consentCheck.aiProcessingNoticeSnapshot?.trim() ||
          consentCheck.consents.length === 0 ||
          consentCheck.consents.some(
            (consent) => consent.decision !== 'granted' || consent.revokedAt,
          )
        )
          throw new AppException(
            'VOICE_MEETING_AI_CONSENT_REVOKED',
            'Participant consent or recording authorization changed during processing. Generated artifacts were discarded.',
            HttpStatus.FORBIDDEN,
          );
        const updated = await tx.voiceVideoRecording.updateMany({
          where: {
            id: recordingId,
            businessId,
            status: 'ready',
            artifactStatus: 'processing',
            aiProcessingAllowed: true,
            retentionExpiresAt: { gt: new Date() },
          },
          data: {
            transcriptText: transcript,
            generatedSummary: safeSummary.text,
            followUpDraft: safeDraft.text || null,
            artifactStatus: 'ready',
            artifactsGeneratedAt: new Date(),
            artifactFailureMessage: null,
          },
        });
        if (!updated.count)
          throw new Error('Meeting processing authorization changed.');
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId: null,
            entity: 'VoiceVideoRecording',
            entityId: recordingId,
            action: 'voice.meeting.ai_artifacts_generated',
            after: {
              provider: 'anthropic',
              providerModelReported: false,
              transcriptCharacters: transcript.length,
              redactions,
              followUpDraftAvailable: Boolean(safeDraft.text),
              confidence: 'not_calibrated',
            },
          },
        });
      });
      return { status: 'ready' as const };
    } catch (error) {
      const message = this.safeFailure(error);
      const response =
        error instanceof AppException ? error.getResponse() : null;
      const discardArtifacts =
        response !== null &&
        typeof response === 'object' &&
        'code' in response &&
        response.code === 'VOICE_MEETING_AI_CONSENT_REVOKED';
      await this.markFailed(recordingId, businessId, message, discardArtifacts);
      throw new Error(message);
    }
  }

  async createFollowUpDraft(
    businessId: string,
    actorUserId: string,
    meetingId: string,
    recordingId: string,
  ) {
    await this.assertHost(businessId, actorUserId, meetingId);
    const row = await this.prisma.voiceVideoRecording.findFirst({
      where: {
        id: recordingId,
        businessId,
        meetingId,
        status: 'ready',
        artifactStatus: 'ready',
        retentionExpiresAt: { gt: new Date() },
      },
      include: { meeting: { select: { customerId: true } } },
    });
    if (!row?.followUpDraft?.trim())
      throw this.invalid(
        'There is no AI follow-up draft available for review.',
      );
    if (!row.meeting.customerId)
      throw this.invalid(
        'Link a canonical customer to the meeting before creating an inbox draft.',
      );
    const sourceKey = `meeting-ai-followup:${recordingId}`;
    const draft = await this.prisma.messageDraft.upsert({
      where: { businessId_sourceKey: { businessId, sourceKey } },
      update: {},
      create: {
        businessId,
        customerId: row.meeting.customerId,
        sourceMeetingId: meetingId,
        sourceKey,
        body: row.followUpDraft,
      },
      select: { id: true, status: true, body: true, createdAt: true },
    });
    await this.prisma.auditLog.create({
      data: {
        businessId,
        actorUserId,
        entity: 'MessageDraft',
        entityId: draft.id,
        action: 'voice.meeting.followup_draft_created',
        after: { meetingId, recordingId, sent: false },
      },
    });
    return { id: draft.id, status: draft.status, sent: false };
  }

  async markFailed(
    recordingId: string,
    businessId: string,
    message: string,
    discardArtifacts = false,
  ) {
    await this.prisma.voiceVideoRecording.updateMany({
      where: {
        id: recordingId,
        businessId,
        artifactStatus: { in: ['queued', 'processing'] },
      },
      data: {
        artifactStatus: 'failed',
        artifactFailureMessage: message.slice(0, 500),
        ...(discardArtifacts
          ? {
              transcriptText: null,
              generatedSummary: null,
              followUpDraft: null,
              artifactsGeneratedAt: null,
            }
          : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        businessId,
        actorUserId: null,
        entity: 'VoiceVideoRecording',
        entityId: recordingId,
        action: 'voice.meeting.ai_artifacts_failed',
        after: { reason: message.slice(0, 500) },
      },
    });
  }

  async recoverStaleProcessing(limit = 100) {
    const cutoff = new Date(Date.now() - 30 * 60_000);
    const rows = await this.prisma.voiceVideoRecording.findMany({
      where: {
        artifactStatus: 'processing',
        updatedAt: { lt: cutoff },
      },
      select: { id: true, businessId: true },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: Math.max(1, Math.min(500, limit)),
    });
    let recovered = 0;
    for (const row of rows) {
      const result = await this.prisma.voiceVideoRecording.updateMany({
        where: {
          id: row.id,
          businessId: row.businessId,
          artifactStatus: 'processing',
          updatedAt: { lt: cutoff },
        },
        data: {
          artifactStatus: 'failed',
          artifactFailureMessage:
            'The processing worker stopped before completion. Review provider usage before retrying.',
        },
      });
      if (!result.count) continue;
      await this.prisma.auditLog.create({
        data: {
          businessId: row.businessId,
          entity: 'VoiceVideoRecording',
          entityId: row.id,
          action: 'voice.meeting.ai_artifacts_stale_recovered',
          after: {
            cutoff: cutoff.toISOString(),
            retryRequiresHumanReview: true,
          },
        },
      });
      recovered += 1;
    }
    return { checked: rows.length, recovered };
  }

  private async assertHost(
    businessId: string,
    actorUserId: string,
    meetingId: string,
  ) {
    const meeting = await this.prisma.voiceVideoMeeting.findFirst({
      where: { id: meetingId, businessId },
      select: { id: true, hostBusinessUserId: true },
    });
    if (!meeting) throw this.invalid('Meeting not found.');
    const host = await this.prisma.businessUser.findFirst({
      where: {
        id: meeting.hostBusinessUserId,
        businessId,
        userId: actorUserId,
        active: true,
      },
      select: { id: true },
    });
    if (!host)
      throw new AppException(
        'VOICE_MEETING_HOST_NOT_FOUND',
        'Only the assigned active host can process meeting artifacts.',
        HttpStatus.FORBIDDEN,
      );
  }

  private parseSummary(value: string): GeneratedSummary {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start < 0 || end <= start)
      throw new Error('The AI summary response was not valid JSON.');
    const parsed = JSON.parse(value.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
    if (
      typeof parsed.summary !== 'string' ||
      parsed.summary.trim().length < 5 ||
      parsed.summary.length > 4000 ||
      typeof parsed.followUpDraft !== 'string' ||
      parsed.followUpDraft.length > 2000
    )
      throw new Error(
        'The AI summary response did not match the expected format.',
      );
    return {
      summary: parsed.summary.trim(),
      followUpDraft: parsed.followUpDraft.trim(),
    };
  }

  private safeFailure(error: unknown) {
    const response = error instanceof AppException ? error.getResponse() : null;
    const responseCode =
      response && typeof response === 'object' && 'code' in response
        ? String(response.code)
        : '';
    const text =
      response && typeof response === 'object' && 'message' in response
        ? String(response.message)
        : error instanceof Error
          ? error.message
          : '';
    if (responseCode === 'SPEECH_TO_TEXT_UNAVAILABLE')
      return 'Speech transcription provider is unavailable or not configured. No summary was saved.';
    if (responseCode === 'VOICE_MEETING_AI_CONSENT_REVOKED')
      return 'Participant consent or recording authorization changed during processing. Generated artifacts were discarded.';
    if (
      [
        'AI_FEATURE_DISABLED',
        'AI_RATE_LIMITED',
        'AI_COST_CAP_EXCEEDED',
      ].includes(responseCode)
    )
      return text;
    if (responseCode.startsWith('AI_PROVIDER_'))
      return describeAiProviderFailure(error).message;
    if (text.includes('AI feature has been turned off')) return text;
    if (text.includes('AI provider') || text.includes('ANTHROPIC_API_KEY'))
      return 'AI summary provider is unavailable or not configured. No summary was saved.';
    if (text.includes('SPEECH_TO_TEXT_UNAVAILABLE'))
      return 'Speech transcription provider is unavailable or not configured. No summary was saved.';
    if (
      text.length < 300 &&
      /^(The |This |Meeting |Stored |The AI|A )/.test(text)
    )
      return text;
    return 'Meeting transcription or summary failed. Check provider configuration and retry after review.';
  }

  private invalid(message: string) {
    return new AppException(
      'VOICE_MEETING_ARTIFACTS_INVALID',
      message,
      HttpStatus.CONFLICT,
    );
  }
}
