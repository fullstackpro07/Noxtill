import { createHash } from 'crypto';
import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceCallService } from './voice-call.service';
import { VoiceMediaMeteringService } from './voice-media-metering.service';
import { VoiceRealtimeService } from './voice-realtime.service';

const MAX_CONSECUTIVE_FAILURES = 5;
const PROCESSING_LEASE_MS = 2 * 60 * 1000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

type StatusPayload = {
  callSid: string;
  callStatus: string;
  sequenceNumber: number | null;
};

type TransferStatusPayload = StatusPayload & {
  callId: string;
  attemptNumber: number;
  providerCallSid: string | null;
};

type AgentStatusPayload = StatusPayload & {
  attemptNumber: number | null;
  providerCallSid: string | null;
};

type ConferenceUsagePayload = {
  AccountSid: string;
  StatusCallbackEvent: string;
  FriendlyName: string;
  ConferenceSid: string;
  CallSid: string;
  SequenceNumber: string;
  Timestamp: string;
};

type RealtimeRecordingPayload = { callSid: string; recordingSid: string };

type VoiceEventPayload =
  | StatusPayload
  | TransferStatusPayload
  | AgentStatusPayload
  | ConferenceUsagePayload
  | RealtimeRecordingPayload;

/**
 * Durable inbox for signed Twilio callbacks whose projections are replay-safe.
 * It stores only allowlisted fields used by each projector, not headers,
 * signatures or raw request bodies. Command-bearing TwiML routes stay outside
 * this inbox because replaying them could repeat provider side effects.
 */
@Injectable()
export class VoiceProviderWebhookEventsService {
  private readonly logger = new Logger(VoiceProviderWebhookEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly voiceCall: VoiceCallService,
    @Optional() private readonly mediaMetering?: VoiceMediaMeteringService,
    @Optional() private readonly realtimeVoice?: VoiceRealtimeService,
  ) {}

  async receiveCallStatus(
    callSid: string,
    callStatus: string,
    sequenceNumber?: number,
  ): Promise<void> {
    const call = await this.prisma.phoneCall.findUnique({
      where: { callSid },
      select: { businessId: true },
    });
    if (!call) {
      await this.voiceCall.handleStatus(callSid, callStatus, sequenceNumber);
      return;
    }
    const payload: StatusPayload = {
      callSid,
      callStatus,
      sequenceNumber: this.validSequence(sequenceNumber),
    };
    await this.receive(call.businessId, callSid, 'call.status', payload);
  }

  async receiveTransferStatus(
    callId: string,
    attemptNumber: number,
    callStatus: string,
    providerCallSid?: string,
    sequenceNumber?: number,
  ): Promise<void> {
    const transfer = await this.prisma.voiceCallTransfer.findFirst({
      where: { callId, attemptNumber },
      select: {
        businessId: true,
        call: { select: { callSid: true } },
      },
    });
    if (!transfer) {
      await this.voiceCall.recordTransferProviderStatus(
        callId,
        attemptNumber,
        callStatus,
        providerCallSid,
        sequenceNumber,
      );
      return;
    }
    const payload: TransferStatusPayload = {
      callId,
      attemptNumber,
      callSid: transfer.call.callSid,
      callStatus,
      providerCallSid: providerCallSid ?? null,
      sequenceNumber: this.validSequence(sequenceNumber),
    };
    await this.receive(
      transfer.businessId,
      transfer.call.callSid,
      'transfer.status',
      payload,
    );
  }

  async receiveAgentStatus(
    callSid: string,
    callStatus: string,
    attemptNumber?: number,
    providerCallSid?: string,
    sequenceNumber?: number,
  ): Promise<void> {
    const call = await this.prisma.phoneCall.findUnique({
      where: { callSid },
      select: { businessId: true },
    });
    if (!call) return;
    const payload: AgentStatusPayload = {
      callSid,
      callStatus: this.safeField(callStatus, 40),
      attemptNumber:
        Number.isSafeInteger(attemptNumber) && attemptNumber! > 0
          ? attemptNumber!
          : null,
      providerCallSid: providerCallSid
        ? this.safeField(providerCallSid, 64)
        : null,
      sequenceNumber: this.validSequence(sequenceNumber),
    };
    await this.receive(call.businessId, callSid, 'agent.status', payload);
  }

  /** Called only after the controller verifies Twilio's signature. */
  async receiveConferenceUsage(input: Record<string, string>): Promise<void> {
    const payload: ConferenceUsagePayload = {
      AccountSid: this.safeField(input.AccountSid, 64),
      StatusCallbackEvent: this.safeField(input.StatusCallbackEvent, 32),
      FriendlyName: this.safeField(input.FriendlyName, 80),
      ConferenceSid: this.safeField(input.ConferenceSid, 64),
      CallSid: this.safeField(input.CallSid, 64),
      SequenceNumber: this.safeField(input.SequenceNumber, 16),
      Timestamp: this.safeField(input.Timestamp, 64),
    };
    if (!payload.FriendlyName || !payload.ConferenceSid || !payload.CallSid)
      return;
    const call = await this.prisma.phoneCall.findUnique({
      where: { callSid: payload.FriendlyName },
      select: { businessId: true },
    });
    if (!call) return;
    await this.receive(
      call.businessId,
      payload.FriendlyName,
      'conference.usage',
      payload,
    );
  }

  /** Completed-call recording import is safe to retry: its queue job and storage key are stable. */
  async receiveRealtimeRecording(
    callSid: string,
    recordingSid: string,
  ): Promise<void> {
    if (!/^CA[a-fA-F0-9]{32}$/.test(callSid)) return;
    if (!/^RE[a-fA-F0-9]{32}$/.test(recordingSid)) return;
    const call = await this.prisma.phoneCall.findUnique({
      where: { callSid },
      select: { businessId: true },
    });
    if (!call) return;
    await this.receive(
      call.businessId,
      callSid,
      'realtime.recording.completed',
      { callSid, recordingSid },
    );
  }

  async listFailures(businessId: string) {
    const rows = await this.prisma.voiceProviderWebhookEvent.findMany({
      where: { businessId, state: { in: ['failed', 'dead_letter'] } },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: {
        id: true,
        eventType: true,
        callSid: true,
        state: true,
        attemptCount: true,
        consecutiveFailures: true,
        replayCount: true,
        lastError: true,
        receivedAt: true,
        lastAttemptAt: true,
        nextAttemptAt: true,
      },
    });
    return rows;
  }

  async replay(businessId: string, actorUserId: string, eventId: string) {
    const event = await this.prisma.voiceProviderWebhookEvent.findFirst({
      where: { id: eventId, businessId },
      select: {
        id: true,
        state: true,
        eventType: true,
        attemptCount: true,
        consecutiveFailures: true,
        replayCount: true,
        lastError: true,
      },
    });
    if (!event)
      throw new AppException(
        'VOICE_WEBHOOK_EVENT_NOT_FOUND',
        'The provider callback event was not found.',
        HttpStatus.NOT_FOUND,
      );
    if (!['failed', 'dead_letter'].includes(event.state))
      throw new AppException(
        'VOICE_WEBHOOK_EVENT_NOT_REPLAYABLE',
        'Only failed or dead-letter callback events can be replayed.',
        HttpStatus.CONFLICT,
      );

    await this.prisma.$transaction(async (tx) => {
      const reset = await tx.voiceProviderWebhookEvent.updateMany({
        where: {
          id: event.id,
          businessId,
          state: { in: ['failed', 'dead_letter'] },
        },
        data: {
          state: 'received',
          consecutiveFailures: 0,
          replayCount: { increment: 1 },
          nextAttemptAt: null,
          processingUntil: null,
          lastError: null,
        },
      });
      if (reset.count !== 1)
        throw new AppException(
          'VOICE_WEBHOOK_EVENT_NOT_REPLAYABLE',
          'The callback event changed before it could be replayed.',
          HttpStatus.CONFLICT,
        );
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action: 'voice.provider_webhook.replayed',
          entity: 'VoiceProviderWebhookEvent',
          entityId: event.id,
          before: {
            state: event.state,
            attemptCount: event.attemptCount,
            consecutiveFailures: event.consecutiveFailures,
            lastError: event.lastError,
          },
          after: {
            state: 'received',
            replayCount: event.replayCount + 1,
          },
        },
      });
    });

    await this.processEvent(event.id);
    return this.prisma.voiceProviderWebhookEvent.findFirstOrThrow({
      where: { id: event.id, businessId },
      select: {
        id: true,
        state: true,
        attemptCount: true,
        consecutiveFailures: true,
        replayCount: true,
        lastError: true,
        processedAt: true,
      },
    });
  }

  async retryDue(
    limit = 100,
  ): Promise<{ attempted: number; deadLettered: number }> {
    const now = new Date();
    const rows = await this.prisma.voiceProviderWebhookEvent.findMany({
      where: {
        OR: [
          { state: 'received' },
          {
            state: 'failed',
            consecutiveFailures: { lt: MAX_CONSECUTIVE_FAILURES },
            nextAttemptAt: { lte: now },
          },
          { state: 'processing', processingUntil: { lt: now } },
        ],
      },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(limit, 1), 500),
      select: {
        id: true,
        state: true,
        attemptCount: true,
        consecutiveFailures: true,
        processingUntil: true,
      },
    });
    let attempted = 0;
    let deadLettered = 0;
    for (const row of rows) {
      if (
        row.state === 'processing' &&
        row.processingUntil &&
        row.processingUntil <= now &&
        row.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
      ) {
        const result = await this.prisma.voiceProviderWebhookEvent.updateMany({
          where: {
            id: row.id,
            state: 'processing',
            processingUntil: { lte: now },
          },
          data: {
            state: 'dead_letter',
            processingUntil: null,
            nextAttemptAt: null,
            lastError: 'Processing lease expired after repeated attempts.',
          },
        });
        deadLettered += result.count;
        continue;
      }
      attempted += 1;
      try {
        await this.processEvent(row.id);
      } catch (error) {
        this.logger.warn(
          `Provider webhook event ${row.id} retry failed: ${this.errorText(error)}`,
        );
      }
    }
    return { attempted, deadLettered };
  }

  private async receive(
    businessId: string,
    callSid: string,
    eventType: string,
    payload: VoiceEventPayload,
  ): Promise<void> {
    const eventKey = createHash('sha256')
      .update(JSON.stringify({ provider: 'twilio', eventType, payload }))
      .digest('hex');
    const event = await this.prisma.voiceProviderWebhookEvent.upsert({
      where: { businessId_eventKey: { businessId, eventKey } },
      create: {
        businessId,
        eventKey,
        eventType,
        callSid,
        sequenceNumber:
          'sequenceNumber' in payload ? payload.sequenceNumber : null,
        payload,
      },
      update: {},
      select: { id: true },
    });
    return this.processEvent(event.id);
  }

  private async processEvent(eventId: string): Promise<void> {
    const now = new Date();
    const claim = await this.prisma.voiceProviderWebhookEvent.updateMany({
      where: {
        id: eventId,
        OR: [
          { state: 'received' },
          { state: 'failed', nextAttemptAt: { lte: now } },
          { state: 'processing', processingUntil: null },
          { state: 'processing', processingUntil: { lt: now } },
        ],
      },
      data: {
        state: 'processing',
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        nextAttemptAt: null,
        processingUntil: new Date(now.getTime() + PROCESSING_LEASE_MS),
      },
    });
    if (claim.count !== 1) return;

    const event = await this.prisma.voiceProviderWebhookEvent.findUniqueOrThrow(
      {
        where: { id: eventId },
      },
    );
    try {
      const payload = event.payload as unknown as VoiceEventPayload;
      if (event.eventType === 'call.status') {
        const status = payload as StatusPayload;
        await this.voiceCall.handleStatus(
          status.callSid,
          status.callStatus,
          status.sequenceNumber ?? undefined,
        );
      } else if (event.eventType === 'transfer.status') {
        const status = payload as TransferStatusPayload;
        await this.voiceCall.recordTransferProviderStatus(
          status.callId,
          status.attemptNumber,
          status.callStatus,
          status.providerCallSid ?? undefined,
          status.sequenceNumber ?? undefined,
        );
      } else if (event.eventType === 'agent.status') {
        const status = payload as AgentStatusPayload;
        await this.voiceCall.handleDialStatus(
          status.callSid,
          status.callStatus,
          status.attemptNumber ?? undefined,
          status.providerCallSid ?? undefined,
          status.sequenceNumber ?? undefined,
        );
      } else if (event.eventType === 'conference.usage') {
        if (!this.mediaMetering)
          throw new AppException(
            'VOICE_WEBHOOK_PROJECTOR_UNAVAILABLE',
            'Conference usage processing is unavailable.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        await this.mediaMetering.conference(
          payload as unknown as Record<string, string>,
        );
      } else if (event.eventType === 'realtime.recording.completed') {
        if (!this.realtimeVoice)
          throw new AppException(
            'VOICE_WEBHOOK_PROJECTOR_UNAVAILABLE',
            'Realtime recording processing is unavailable.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        const recording = payload as RealtimeRecordingPayload;
        await this.realtimeVoice.queueRecording(
          recording.callSid,
          recording.recordingSid,
        );
      } else {
        throw new AppException(
          'VOICE_WEBHOOK_EVENT_UNSUPPORTED',
          'This provider callback event type cannot be projected.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      await this.prisma.voiceProviderWebhookEvent.updateMany({
        where: { id: eventId, state: 'processing' },
        data: {
          state: 'processed',
          processedAt: new Date(),
          consecutiveFailures: 0,
          lastError: null,
          processingUntil: null,
          nextAttemptAt: null,
        },
      });
    } catch (error) {
      const consecutiveFailures = event.consecutiveFailures + 1;
      const deadLetter = consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
      const retryDelay =
        RETRY_DELAYS_MS[
          Math.min(consecutiveFailures - 1, RETRY_DELAYS_MS.length - 1)
        ];
      await this.prisma.voiceProviderWebhookEvent.updateMany({
        where: { id: eventId, state: 'processing' },
        data: {
          state: deadLetter ? 'dead_letter' : 'failed',
          consecutiveFailures,
          lastError: this.errorText(error),
          processingUntil: null,
          nextAttemptAt: deadLetter ? null : new Date(Date.now() + retryDelay),
        },
      });
      throw error;
    }
  }

  private validSequence(value?: number): number | null {
    return Number.isSafeInteger(value) && value! >= 0 && value! <= 2_147_483_647
      ? value!
      : null;
  }

  private safeField(value: unknown, maxLength: number): string {
    return typeof value === 'string' ? value.slice(0, maxLength) : '';
  }

  private errorText(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return raw
      .replace(
        /(?:sk-ant|sk-proj|sk_live|sk_test|AC)[A-Za-z0-9_-]{12,}/g,
        '[redacted]',
      )
      .slice(0, 800);
  }
}
