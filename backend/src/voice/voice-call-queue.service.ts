import { createHash } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { resolvePolicies } from '../common/policies/policies.service';
import { escapeXml, say, twiml } from './twiml.util';

const QUEUE_KEY = 'support';

@Injectable()
export class VoiceCallQueueService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly config: ConfigService,
  ) {}

  queueNameForBusiness(businessId: string): string {
    const suffix = createHash('sha256')
      .update(businessId)
      .digest('hex')
      .slice(0, 20);
    return `nx-${suffix}-support`;
  }

  async providerStatus(businessId: string) {
    const business = await this.tenantPrisma.client.business.findUnique({
      where: { id: businessId },
      select: { policies: true },
    });
    const maxWaitSeconds = resolvePolicies(business).num(
      'voice.holdQueueMaxWaitSeconds',
    );
    const hasTwilio = Boolean(
      this.config.get<string>('TWILIO_ACCOUNT_SID') &&
      this.config.get<string>('TWILIO_AUTH_TOKEN'),
    );
    const backendUrl = this.config
      .get<string>('BACKEND_URL')
      ?.replace(/\/+$/, '');
    const holdMusicUrl = this.config.get<string>('VOICE_HOLD_MUSIC_URL');
    const configured = Boolean(
      maxWaitSeconds &&
      hasTwilio &&
      backendUrl &&
      holdMusicUrl &&
      /^https:\/\//i.test(holdMusicUrl),
    );
    return {
      configured,
      queue: QUEUE_KEY,
      maxWaitSeconds,
      holdMusic: configured ? 'configured' : 'not_configured',
      reason: !maxWaitSeconds
        ? 'Set a caller hold-queue wait limit in Settings → AI & Governance.'
        : !hasTwilio
          ? 'Twilio Voice credentials are not configured on this server.'
          : !backendUrl
            ? 'A public backend URL is required for Twilio queue callbacks.'
            : !holdMusicUrl || !/^https:\/\//i.test(holdMusicUrl)
              ? 'A public HTTPS VOICE_HOLD_MUSIC_URL is required before callers can be placed on hold.'
              : null,
    };
  }

  async enqueue(businessId: string, callId: string): Promise<string | null> {
    const status = await this.providerStatus(businessId);
    if (!status.configured || !status.maxWaitSeconds) return null;
    const backendUrl = this.config
      .get<string>('BACKEND_URL')!
      .replace(/\/+$/, '');
    const queueName = this.queueNameForBusiness(businessId);
    const waitUrl = new URL(`${backendUrl}/voice/webhook/queue-wait`);
    waitUrl.searchParams.set('callId', callId);
    const actionUrl = new URL(`${backendUrl}/voice/webhook/queue-exit`);
    actionUrl.searchParams.set('callId', callId);
    await this.tenantPrisma.client.voiceCallQueueEntry.upsert({
      where: { callId },
      create: {
        businessId,
        callId,
        queueName,
        status: 'waiting',
      },
      update: {
        queueName,
        status: 'waiting',
        enteredAt: new Date(),
        exitedAt: null,
        waitSeconds: null,
        overflowAction: null,
        providerQueueSid: null,
      },
    });

    const estimate = await this.estimateWaitSeconds(businessId, queueName);
    const estimatedMessage = estimate
      ? say(
          `The estimated wait is about ${Math.max(1, Math.round(estimate / 60))} minutes.`,
        )
      : '';
    return `${estimatedMessage}<Enqueue action="${escapeXml(actionUrl.toString())}" method="POST" waitUrl="${escapeXml(waitUrl.toString())}" waitUrlMethod="POST">${escapeXml(queueName)}</Enqueue>`;
  }

  async waitTwiMl(callId: string, queueTime: number): Promise<string> {
    const entry = await this.tenantPrisma.client.voiceCallQueueEntry.findUnique(
      { where: { callId } },
    );
    if (!entry) return twiml('<Hangup/>');
    const status = await this.providerStatus(entry.businessId);
    if (!status.configured || !status.maxWaitSeconds) return twiml('<Leave/>');
    if (queueTime >= status.maxWaitSeconds) return twiml('<Leave/>');
    const holdMusicUrl = this.config.get<string>('VOICE_HOLD_MUSIC_URL')!;
    return twiml(`<Play>${escapeXml(holdMusicUrl)}</Play><Pause length="5"/>`);
  }

  async recordExit(
    callId: string,
    queueSid: string | undefined,
    queueTime: number,
    overflowAction: string,
  ) {
    const entry = await this.tenantPrisma.client.voiceCallQueueEntry.findUnique(
      {
        where: { callId },
      },
    );
    if (!entry) {
      throw new AppException(
        'VOICE_QUEUE_ENTRY_NOT_FOUND',
        'This caller is not in the configured hold queue.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.tenantPrisma.client.voiceCallQueueEntry.update({
      where: { callId },
      data: {
        providerQueueSid: queueSid ?? entry.providerQueueSid,
        status: overflowAction === 'connected' ? 'connected' : 'exited',
        exitedAt: new Date(),
        waitSeconds: Math.max(0, Math.floor(queueTime)),
        overflowAction,
      },
    });
    return entry;
  }

  async estimateWaitSeconds(businessId: string, queueName: string) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const samples = await this.tenantPrisma.client.voiceCallQueueEntry.findMany(
      {
        where: {
          businessId,
          queueName,
          waitSeconds: { not: null },
          exitedAt: { gte: since },
        },
        orderBy: [{ exitedAt: 'desc' }, { id: 'asc' }],
        take: 101,
        select: { waitSeconds: true },
      },
    );
    if (samples.length < 3) return null;
    const sorted = samples
      .map((sample) => sample.waitSeconds!)
      .sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  async supervisorStats(businessId: string) {
    const [waiting, configs] = await Promise.all([
      this.tenantPrisma.client.voiceCallQueueEntry.findMany({
        where: { businessId, status: 'waiting' },
        orderBy: [{ enteredAt: 'asc' }, { id: 'asc' }],
        select: { queueName: true, enteredAt: true },
      }),
      this.tenantPrisma.client.voiceCallQueueConfig.findMany({
        where: { businessId },
        orderBy: [{ queueName: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const queueNames = new Set([
      this.queueNameForBusiness(businessId),
      ...waiting.map((entry) => entry.queueName),
      ...configs.map((config) => config.queueName),
    ]);
    const now = Date.now();
    const queues = await Promise.all(
      [...queueNames].sort().map(async (queueName) => {
        const active = waiting.filter((entry) => entry.queueName === queueName);
        const config = configs.find((row) => row.queueName === queueName);
        const waits = active.map((entry) =>
          Math.max(0, Math.floor((now - entry.enteredAt.getTime()) / 1000)),
        );
        const target = config?.slaTargetSeconds ?? null;
        const estimate = await this.estimateWaitSeconds(businessId, queueName);
        return {
          key: QUEUE_KEY,
          label: 'Support',
          queueName,
          waitingCalls: active.length,
          longestWaitSeconds: Math.max(0, ...waits),
          slaTargetSeconds: target,
          slaAtRisk:
            target === null
              ? null
              : waits.filter((wait) => wait >= target).length,
          waitEstimateSeconds: estimate,
          estimateLabel:
            estimate === null
              ? 'Not enough measured waits'
              : 'Estimate from recent measured waits',
        };
      }),
    );
    return {
      queues,
      metrics: {
        waitingCalls: waiting.length,
        longestWaitSeconds: queues.length
          ? Math.max(0, ...queues.map((queue) => queue.longestWaitSeconds))
          : 0,
        slaAtRisk: queues.some((queue) => queue.slaAtRisk !== null)
          ? queues.reduce((sum, queue) => sum + (queue.slaAtRisk ?? 0), 0)
          : null,
      },
    };
  }
}
