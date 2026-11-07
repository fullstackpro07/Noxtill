import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID } from 'crypto';
import { PhoneCallStatus, PhoneCallOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import { S3Service } from '../common/storage/s3.service';
import axios from 'axios';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { VOICE_RETENTION_QUEUE } from './voice.constants';
import { safeEqual } from '../common/webhooks/signature.util';
import { escapeXml, twiml } from './twiml.util';
import {
  VOICE_MEDIA_PATH,
  realtimeCostEstimate,
} from './voice-realtime.protocol';
import type { VoiceAgentControls } from './voice-agent-controls.util';
import type { VoiceKnowledgeSnapshot } from './voice-knowledge-snapshot.util';
import { maskVoicePrivateReferences } from './voice-private-reference.util';
import {
  VOICE_AGENT_AUTHORITY_POLICY,
  voicePromptConfiguration,
  voicePromptData,
} from './voice-prompt-policy.util';
import {
  VoiceUsageMeteringService,
  voiceSpendState,
} from './voice-usage-metering.service';

export type RealtimeAgentConfig = VoiceAgentControls & {
  purpose?: string;
  instructions?: string;
  voiceStyle?: string;
  languages?: string[];
  toolPermissions?: string[];
  knowledgeSourceIds?: string[];
  knowledgeSnapshots?: VoiceKnowledgeSnapshot[];
  maxTokensPerResponse?: number;
  monthlyBudgetUsd?: number | null;
};

@Injectable()
export class VoiceRealtimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ai: AiInfraService,
    @Optional() private readonly metering?: VoiceUsageMeteringService,
    @Optional() private readonly storage?: S3Service,
    @Optional()
    @InjectQueue(VOICE_RETENTION_QUEUE)
    private readonly mediaQueue?: Queue,
  ) {}

  mediaUrl() {
    try {
      const url = new URL(this.config.get<string>('BACKEND_URL') ?? '');
      if (
        url.protocol !== 'https:' ||
        ['localhost', '127.0.0.1'].includes(url.hostname)
      )
        return null;
      return `wss://${url.host}${VOICE_MEDIA_PATH}`;
    } catch {
      return null;
    }
  }

  private token(session: { id: string; callId: string; expiresAt: Date }) {
    return createHmac(
      'sha256',
      this.config.get<string>('TWILIO_AUTH_TOKEN') ?? '',
    )
      .update(
        `${session.id}:${session.callId}:${session.expiresAt.toISOString()}`,
      )
      .digest('hex');
  }

  /** Preserve policy notices and IVR speech; replace only the next AI audio-input step. */
  async maybeConnect(xml: string, callSid: string): Promise<string> {
    const index = xml.search(/<Record\b|<Gather input="speech"/);
    if (index < 0) return xml;
    const call = await this.prisma.phoneCall.findUnique({
      where: { callSid },
      include: { voiceAgentVersion: true },
    });
    const agent = call?.voiceAgentVersion?.config as
      RealtimeAgentConfig | undefined;
    if (!call || agent?.runtimeMode !== 'realtime') return xml;
    const mediaUrl = this.mediaUrl();
    const auth = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!mediaUrl || !auth || !this.config.get<string>('OPENAI_API_KEY')) {
      await this.failCall(
        call.id,
        call.businessId,
        'VOICE_REALTIME_NOT_CONFIGURED',
      );
      return twiml(
        '<Say>Live AI voice is not configured. The team will follow up with you.</Say><Hangup/>',
      );
    }
    if (
      call.direction === 'inbound' &&
      call.recordingConsentStatus !== 'granted'
    )
      return xml;
    try {
      await this.checkBudget(call.businessId, call.voiceAgentVersionId!, agent);
    } catch {
      await this.failCall(
        call.id,
        call.businessId,
        'VOICE_REALTIME_BUDGET_OR_FEATURE_BLOCKED',
      );
      return twiml(
        '<Say>The live assistant is unavailable. The team will follow up with you.</Say><Hangup/>',
      );
    }
    const existing = await this.prisma.voiceRealtimeSession.findUnique({
      where: { callId: call.id },
    });
    if (existing && existing.status !== 'pending') return xml;
    const expiresAt = new Date(Date.now() + 60_000);
    const sessionId = existing?.id ?? randomUUID();
    const token = this.token({
      id: sessionId,
      callId: call.id,
      expiresAt: existing?.expiresAt ?? expiresAt,
    });
    const session = await this.prisma.voiceRealtimeSession.upsert({
      where: { callId: call.id },
      update: {},
      create: {
        id: sessionId,
        businessId: call.businessId,
        callId: call.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt,
        model:
          this.config.get<string>('OPENAI_REALTIME_MODEL') ?? 'gpt-realtime',
        metrics: {},
      },
    });
    const streamToken = this.token(session);
    const connect = `<Connect><Stream url="${escapeXml(mediaUrl)}"><Parameter name="sessionId" value="${session.id}"/><Parameter name="token" value="${streamToken}"/></Stream></Connect>`;
    const fallback = `${new URL(mediaUrl).origin.replace('wss:', 'https:')}/api/v1/voice/webhook/realtime-ended`;
    return `${xml.slice(0, index)}${connect}<Redirect method="POST">${escapeXml(fallback)}</Redirect></Response>`;
  }

  async acceptStart(start: {
    accountSid: string;
    callSid: string;
    streamSid: string;
    customParameters: { sessionId?: string; token?: string };
    mediaFormat: { encoding: string; sampleRate: number; channels: number };
  }) {
    if (
      start.accountSid !== this.config.get<string>('TWILIO_ACCOUNT_SID') ||
      start.mediaFormat.encoding !== 'audio/x-mulaw' ||
      start.mediaFormat.sampleRate !== 8000 ||
      start.mediaFormat.channels !== 1
    )
      throw new AppException(
        'VOICE_STREAM_FORBIDDEN',
        'The media stream is invalid.',
        HttpStatus.FORBIDDEN,
      );
    const session = await this.prisma.voiceRealtimeSession.findUnique({
      where: { id: start.customParameters.sessionId ?? '' },
      include: { call: { include: { voiceAgentVersion: true } } },
    });
    if (
      !session ||
      session.call.callSid !== start.callSid ||
      session.call.status !== 'in_progress' ||
      !session.call.voiceAgentVersion ||
      session.expiresAt < new Date() ||
      !safeEqual(
        session.tokenHash,
        createHash('sha256')
          .update(start.customParameters.token ?? '')
          .digest('hex'),
      ) ||
      (session.call.direction === 'inbound' &&
        session.call.recordingConsentStatus !== 'granted')
    )
      throw new AppException(
        'VOICE_STREAM_FORBIDDEN',
        'The media stream is invalid.',
        HttpStatus.FORBIDDEN,
      );
    const controls = session.call.voiceAgentVersion
      .config as RealtimeAgentConfig;
    if (controls.runtimeMode !== 'realtime')
      throw new AppException(
        'VOICE_STREAM_FORBIDDEN',
        'This agent does not use realtime voice.',
        HttpStatus.FORBIDDEN,
      );
    await this.checkBudget(
      session.businessId,
      session.call.voiceAgentVersionId!,
      controls,
    );
    const claimed = await this.prisma.voiceRealtimeSession.updateMany({
      where: { id: session.id, status: 'pending' },
      data: {
        status: 'active',
        streamSid: start.streamSid,
        startedAt: new Date(),
      },
    });
    if (claimed.count !== 1)
      throw new AppException(
        'VOICE_STREAM_ALREADY_USED',
        'This stream has already connected.',
        HttpStatus.CONFLICT,
      );
    const [business, knowledge] = await Promise.all([
      this.prisma.business.findUniqueOrThrow({
        where: { id: session.businessId },
        select: { name: true, timezone: true },
      }),
      this.prisma.voiceKnowledgeEntry.findMany({
        where: {
          businessId: session.businessId,
          active: true,
          id: { in: controls.knowledgeSourceIds ?? [] },
        },
        orderBy: { id: 'asc' },
        take: 20,
        select: { id: true, title: true, content: true },
      }),
    ]);
    const activeIds = new Set(knowledge.map((source) => source.id));
    // New versions pin content; an explicit source revocation still takes effect immediately.
    const corpus =
      controls.knowledgeSnapshots === undefined
        ? knowledge
        : controls.knowledgeSnapshots.filter((source) =>
            activeIds.has(source.id),
          );
    if (corpus.length)
      await this.prisma.voiceKnowledgeEntry.updateMany({
        where: {
          businessId: session.businessId,
          active: true,
          id: { in: corpus.map((source) => source.id) },
        },
        data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
      });
    await this.prisma.auditLog.create({
      data: {
        businessId: session.businessId,
        entity: 'PhoneCall',
        entityId: session.callId,
        action: 'voice.ai_knowledge_context',
        after: {
          voiceAgentVersionId: session.call.voiceAgentVersionId,
          pinnedContent: controls.knowledgeSnapshots !== undefined,
          sources: corpus.map((source) => ({
            id: source.id,
            contentHash:
              'contentHash' in source && typeof source.contentHash === 'string'
                ? source.contentHash
                : null,
          })),
        },
      },
    });
    return {
      session: { ...session, streamSid: start.streamSid },
      controls,
      knowledgeSourceIds: corpus.map((source) => source.id),
      instructions: [
        VOICE_AGENT_AUTHORITY_POLICY,
        `You are the disclosed AI phone assistant. Current server time: ${new Date().toISOString()}.`,
        voicePromptConfiguration('Pinned tenant-approved agent configuration', {
          businessName: business.name,
          businessTimezone: business.timezone,
          purpose: controls.purpose ?? null,
          voiceStyle: controls.voiceStyle ?? null,
          instructions: controls.instructions ?? null,
          languages: controls.languages ?? [],
        }),
        `Pinned tool allowlist: ${(controls.toolPermissions ?? []).join(', ') || 'none'}. The server enforces this list; never claim an action outside it.`,
        'Use the allowed tools for business actions. Read back requested booking details and request confirmation. Never claim a booking or transfer succeeded before a tool confirms it. No payment or refund tools are available.',
        voicePromptData(
          'Pinned knowledge source snapshots',
          corpus.map((source) => ({
            id: source.id,
            title: source.title,
            content: source.content.slice(0, 1500),
          })),
        ),
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  async checkKnowledge(businessId: string, sourceIds: string[]) {
    if (!sourceIds.length) return;
    const available = await this.prisma.voiceKnowledgeEntry.count({
      where: { businessId, active: true, id: { in: sourceIds } },
    });
    if (available !== sourceIds.length)
      throw new AppException(
        'VOICE_AGENT_KNOWLEDGE_REVOKED',
        'A source used by this agent was revoked. Hand the caller to the team.',
        HttpStatus.FORBIDDEN,
      );
  }

  async checkBudget(
    businessId: string,
    versionId: string,
    controls: RealtimeAgentConfig,
  ) {
    await this.ai.checkGuardrails(businessId, 'voice_entry');
    if ((await voiceSpendState(this.prisma, businessId)).reached)
      throw new AppException(
        'VOICE_SPEND_CAP_REACHED',
        'This business has reached its monthly phone spending cap.',
        HttpStatus.FORBIDDEN,
      );
    if (controls.monthlyBudgetUsd) {
      const now = new Date();
      const sum = await this.prisma.aiCallLog.aggregate({
        where: {
          businessId,
          voiceAgentVersionId: versionId,
          createdAt: {
            gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
          },
        },
        _sum: { estimatedCostUsd: true },
      });
      if (Number(sum._sum.estimatedCostUsd ?? 0) >= controls.monthlyBudgetUsd)
        throw new AppException(
          'VOICE_AI_VERSION_BUDGET_REACHED',
          'This AI agent version has reached its monthly call budget.',
          HttpStatus.FORBIDDEN,
        );
    }
  }

  async recordResponse(
    sessionId: string,
    response: { id: string; usage?: Record<string, unknown> },
  ) {
    if (!response.id || !response.usage) return;
    const session = await this.prisma.voiceRealtimeSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { call: true },
    });
    const cost = realtimeCostEstimate(session.model, response.usage);
    const input = Number(response.usage.input_tokens ?? 0);
    const output = Number(response.usage.output_tokens ?? 0);
    if (![input, output].every((v) => Number.isSafeInteger(v) && v >= 0))
      return;
    await this.prisma.$transaction(async (tx) => {
      const eventKey = `openai:realtime:${response.id}`;
      await tx.$queryRaw`SELECT id FROM phone_calls WHERE id = ${session.callId} FOR UPDATE`;
      const previous = await tx.voiceUsageRecord.findUnique({
        where: {
          businessId_eventKey: { businessId: session.businessId, eventKey },
        },
      });
      if (previous && previous.state !== 'pending') return;
      const data = {
        businessId: session.businessId,
        callId: session.callId,
        eventKey,
        provider: 'openai',
        unit: 'realtime_tokens',
        quantity: input + output,
        cost,
        currency: cost === null ? null : 'USD',
        state: cost === null ? 'unpriced' : 'estimated',
        evidence: {
          model: session.model,
          responseId: response.id,
          usage: response.usage,
          costBasis: 'uncached_list_price_estimate',
        } as Prisma.InputJsonValue,
      };
      await tx.voiceUsageRecord.upsert({
        where: {
          businessId_eventKey: { businessId: session.businessId, eventKey },
        },
        create: data,
        update: data,
      });
      if (cost !== null)
        await tx.aiCallLog.create({
          data: {
            businessId: session.businessId,
            kind: 'voice_realtime',
            voiceAgentVersionId: session.call.voiceAgentVersionId,
            inputTokens: input,
            outputTokens: output,
            estimatedCostUsd: cost,
          },
        });
    });
    await this.metering?.checkAlerts(session.businessId);
  }

  async startResponse(sessionId: string, responseId: string) {
    const session = await this.prisma.voiceRealtimeSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    const eventKey = `openai:realtime:${responseId}`;
    await this.prisma.voiceUsageRecord.upsert({
      where: {
        businessId_eventKey: { businessId: session.businessId, eventKey },
      },
      update: {},
      create: {
        businessId: session.businessId,
        callId: session.callId,
        eventKey,
        provider: 'openai',
        unit: 'realtime_tokens',
        quantity: 0,
        state: 'pending',
        evidence: { responseId, model: session.model },
      },
    });
  }

  async beginRecording(sessionId: string) {
    const session = await this.prisma.voiceRealtimeSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { call: true },
    });
    if (session.call.direction !== 'inbound') return;
    if (
      session.call.recordingConsentStatus !== 'granted' ||
      !session.call.recordingPolicyVersionId
    )
      throw new AppException(
        'VOICE_RECORDING_CONSENT_REQUIRED',
        'Recording consent and its published policy are required.',
        HttpStatus.FORBIDDEN,
      );
    const account = this.config.get<string>('TWILIO_ACCOUNT_SID') ?? '';
    const callback = `${new URL(this.mediaUrl()!).origin.replace('wss:', 'https:')}/api/v1/voice/webhook/realtime-recording`;
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${account}/Calls/${session.call.callSid}/Recordings.json`,
      new URLSearchParams({
        RecordingChannels: 'dual',
        RecordingStatusCallback: callback,
        RecordingStatusCallbackMethod: 'POST',
        RecordingStatusCallbackEvent: 'completed',
      }).toString(),
      {
        auth: {
          username: account,
          password: this.config.get<string>('TWILIO_AUTH_TOKEN') ?? '',
        },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 8000,
      },
    );
    await this.prisma.auditLog.create({
      data: {
        businessId: session.businessId,
        entity: 'PhoneCall',
        entityId: session.callId,
        action: 'voice.realtime.recording_requested',
        after: {
          policyVersionId: session.call.recordingPolicyVersionId,
          confirmed: false,
        },
      },
    });
  }

  async queueRecording(callSid: string, recordingSid: string) {
    if (!/^RE[a-fA-F0-9]{32}$/.test(recordingSid)) return;
    if (!this.mediaQueue)
      throw new AppException(
        'VOICE_MEDIA_QUEUE_NOT_CONFIGURED',
        'Recording processing is unavailable.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    await this.mediaQueue.add(
      'import-realtime-recording',
      { callSid, recordingSid },
      {
        jobId: `realtime-recording-${recordingSid}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 7 * 86400, count: 10000 },
        removeOnFail: false,
      },
    );
  }

  private async removeProviderRecording(
    url: string,
    auth: { username: string; password: string },
  ) {
    try {
      await axios.delete(url, { auth, timeout: 8000 });
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 404)
        throw error;
    }
  }

  async saveRecording(callSid: string, recordingSid: string) {
    if (!/^RE[a-fA-F0-9]{32}$/.test(recordingSid) || !this.storage) return;
    const call = await this.prisma.phoneCall.findUnique({ where: { callSid } });
    if (
      !call ||
      call.direction !== 'inbound' ||
      call.recordingConsentStatus !== 'granted'
    )
      return;
    const key = `voice-recordings/${call.businessId}/${callSid}-${recordingSid}.mp3`;
    const account = this.config.get<string>('TWILIO_ACCOUNT_SID') ?? '';
    const url = `https://api.twilio.com/2010-04-01/Accounts/${account}/Recordings/${recordingSid}.json`;
    const auth = {
      username: account,
      password: this.config.get<string>('TWILIO_AUTH_TOKEN') ?? '',
    };
    if (call.recordingKey === key) {
      if (!call.legalHoldAt) await this.removeProviderRecording(url, auth);
      return;
    }
    const receipt = await axios.get<{ call_sid: string; status: string }>(url, {
      auth,
      timeout: 8000,
    });
    if (
      receipt.data.call_sid !== callSid ||
      receipt.data.status !== 'completed'
    )
      return;
    if (
      call.recordingDeletedAt ||
      (!call.legalHoldAt &&
        call.recordingExpiresAt &&
        call.recordingExpiresAt <= new Date())
    ) {
      if (!call.legalHoldAt) await this.removeProviderRecording(url, auth);
      return;
    }
    const audio = await axios.get<ArrayBuffer>(url.replace(/\.json$/, '.mp3'), {
      auth,
      responseType: 'arraybuffer',
      timeout: 15_000,
      maxContentLength: 32 * 1024 * 1024,
    });
    const bytes = Buffer.from(audio.data);
    await this.storage.upload(key, bytes, 'audio/mpeg');
    // Record before committing the pointer: if metering fails, a retry must not skip it.
    await this.metering?.recordUpload(
      call.businessId,
      callSid,
      key,
      bytes.length,
    );
    const saved = await this.prisma.phoneCall.updateMany({
      where: {
        id: call.id,
        recordingDeletedAt: null,
        OR: [
          { legalHoldAt: { not: null } },
          { recordingExpiresAt: null },
          { recordingExpiresAt: { gt: new Date() } },
        ],
      },
      data: { recordingKey: key },
    });
    if (!saved.count) {
      await this.storage.delete(key);
      return;
    }
    await this.prisma.auditLog.create({
      data: {
        businessId: call.businessId,
        entity: 'PhoneCall',
        entityId: call.id,
        action: 'voice.realtime.recording_saved',
        after: { providerRecordingSid: recordingSid, bytes: bytes.length },
      },
    });
    const current = await this.prisma.phoneCall.findUnique({
      where: { id: call.id },
      select: { legalHoldAt: true },
    });
    if (current && !current.legalHoldAt)
      await this.removeProviderRecording(url, auth);
  }

  async appendTranscript(
    callId: string,
    speaker: 'caller' | 'assistant',
    text: string,
  ) {
    if (!text.trim()) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM phone_calls WHERE id = ${callId} FOR UPDATE`;
      const call = await tx.phoneCall.findUniqueOrThrow({
        where: { id: callId },
      });
      // A retention/legal-hold deletion must not be undone by a late provider event.
      if (call.recordingDeletedAt) return;
      const transcript = Array.isArray(call.transcript) ? call.transcript : [];
      await tx.phoneCall.update({
        where: { id: callId },
        data: {
          transcript: [
            ...transcript,
            {
              speaker,
              text: maskVoicePrivateReferences(text).slice(0, 4000),
              at: new Date().toISOString(),
            },
          ].slice(-400),
        },
      });
    });
  }

  async finish(
    sessionId: string,
    metrics: Prisma.InputJsonObject,
    errorCode?: string,
  ) {
    const session = await this.prisma.voiceRealtimeSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) return;
    const updated = await this.prisma.voiceRealtimeSession.updateMany({
      where: { id: sessionId, status: 'active' },
      data: {
        status: errorCode ? 'failed' : 'completed',
        finishedAt: new Date(),
        metrics,
        errorCode,
      },
    });
    if (updated.count === 1 && errorCode)
      await this.failCall(session.callId, session.businessId, errorCode);
  }

  private async failCall(callId: string, businessId: string, code: string) {
    await this.prisma.phoneCall.updateMany({
      where: { id: callId, businessId, status: PhoneCallStatus.in_progress },
      data: { outcome: PhoneCallOutcome.message },
    });
    await this.prisma.auditLog.create({
      data: {
        businessId,
        entity: 'PhoneCall',
        entityId: callId,
        action: 'voice.realtime.unavailable',
        after: { code },
      },
    });
  }
}
