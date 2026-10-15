import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhoneCallStatus } from '@prisma/client';
import axios from 'axios';
import { resolvePolicies } from '../common/policies/policies.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

export type HealthStatus = 'ok' | 'warning' | 'error' | 'not_configured';

export interface HealthCheck {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
}

/**
 * Receptionist Settings — provider health and this month's usage. Every check is either a live
 * provider read or a fact from configuration/stored rows; nothing is assumed healthy.
 */
@Injectable()
export class VoiceProviderHealthService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly config: ConfigService,
  ) {}

  async health(businessId: string) {
    const checkedAt = new Date();
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const backendUrl = this.config.get<string>('BACKEND_URL') ?? '';
    const auth =
      accountSid && authToken
        ? { username: accountSid, password: authToken }
        : null;
    const base = accountSid
      ? `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`
      : '';

    const [line, trackingNumbers, lastCall] = await Promise.all([
      this.tenantPrisma.client.phoneNumber.findUnique({
        where: { businessId },
      }),
      this.tenantPrisma.client.voiceTrackingNumber.count({
        where: { businessId, active: true },
      }),
      this.tenantPrisma.client.phoneCall.findFirst({
        where: { businessId },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      }),
    ]);

    const checks: HealthCheck[] = [];

    // 1. Telephony account
    if (!auth) {
      checks.push({
        key: 'twilio_account',
        label: 'Telephony account',
        status: 'not_configured',
        detail: 'Twilio credentials are not set on this server.',
      });
    } else {
      try {
        const account = await axios.get<{
          status: string;
          friendly_name?: string;
        }>(`${base}.json`, { auth, timeout: 8000 });
        checks.push({
          key: 'twilio_account',
          label: 'Telephony account',
          status: account.data.status === 'active' ? 'ok' : 'error',
          detail: `Twilio account status: ${account.data.status}.`,
        });
      } catch (error) {
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;
        checks.push({
          key: 'twilio_account',
          label: 'Telephony account',
          status: 'error',
          detail:
            status === 401
              ? 'Twilio rejected the saved credentials.'
              : 'Twilio could not be reached just now.',
        });
      }
    }

    // 2. Public webhook URL (Twilio must reach it)
    const publicUrl =
      /^https:\/\//.test(backendUrl) &&
      !/localhost|127\.0\.0\.1/.test(backendUrl);
    checks.push({
      key: 'webhook_url',
      label: 'Webhook address',
      status: !backendUrl ? 'not_configured' : publicUrl ? 'ok' : 'warning',
      detail: !backendUrl
        ? 'BACKEND_URL is not set, so the provider cannot call back.'
        : publicUrl
          ? 'Webhooks use a public HTTPS address.'
          : 'BACKEND_URL is not a public HTTPS address; the provider cannot deliver calls or status updates to it.',
    });

    // 3. Business line routing
    if (!line) {
      checks.push({
        key: 'business_line',
        label: 'Business number',
        status: 'not_configured',
        detail: 'No business phone number is provisioned.',
      });
    } else if (!auth) {
      checks.push({
        key: 'business_line',
        label: 'Business number',
        status: 'warning',
        detail: `${line.phoneNumber} is saved, but its routing cannot be verified without provider credentials.`,
      });
    } else {
      try {
        const number = await axios.get<{ voice_url: string | null }>(
          `${base}/IncomingPhoneNumbers/${line.twilioSid}.json`,
          { auth, timeout: 8000 },
        );
        const expected = `${backendUrl}/voice/webhook/incoming`;
        checks.push({
          key: 'business_line',
          label: 'Business number',
          status: number.data.voice_url === expected ? 'ok' : 'error',
          detail:
            number.data.voice_url === expected
              ? `${line.phoneNumber} routes incoming calls to Noxtill.`
              : `${line.phoneNumber} routes to ${number.data.voice_url ?? 'nothing'} instead of Noxtill's incoming-call webhook.`,
        });
      } catch {
        checks.push({
          key: 'business_line',
          label: 'Business number',
          status: 'error',
          detail: `${line.phoneNumber} was not found in the connected Twilio account.`,
        });
      }
    }

    // 4. Recording storage, transcription/AI, email (configuration facts only)
    const s3 =
      !!this.config.get<string>('S3_ACCESS_KEY_ID') &&
      !!this.config.get<string>('S3_SECRET_ACCESS_KEY');
    checks.push({
      key: 'recording_storage',
      label: 'Recording storage',
      status: s3 ? 'ok' : 'warning',
      detail: s3
        ? 'Recordings are stored in S3 with signed links.'
        : 'Recordings are stored on this server’s local disk with signed, expiring links (no S3 credentials).',
    });
    const speech = !!this.config.get<string>('OPENAI_API_KEY');
    checks.push({
      key: 'speech_ai',
      label: 'Transcription & AI replies',
      status: speech ? 'ok' : 'not_configured',
      detail: speech
        ? 'Speech-to-text and AI reply keys are set (not called by this check).'
        : 'OPENAI_API_KEY is not set; calls cannot be transcribed or answered by AI.',
    });
    const email =
      !!this.config.get<string>('EMAIL_PROVIDER_KEY') &&
      !!this.config.get<string>('EMAIL_FROM_ADDRESS');
    checks.push({
      key: 'email',
      label: 'Email (meeting invites)',
      status: email ? 'ok' : 'not_configured',
      detail: email
        ? 'Email provider key and sender are set (not called by this check).'
        : 'Email delivery is not configured; invite links must be shared manually.',
    });

    return {
      checkedAt: checkedAt.toISOString(),
      overall: checks.some((check) => check.status === 'error')
        ? 'error'
        : checks.some((check) => check.status !== 'ok')
          ? 'warning'
          : 'ok',
      checks,
      activeTrackingNumbers: trackingNumbers,
      lastCallAt: lastCall?.startedAt.toISOString() ?? null,
    };
  }

  /** Calendar-month usage in UTC from saved calls; cost only where the provider priced the call. */
  async usage(businessId: string) {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const calls = await this.tenantPrisma.client.phoneCall.findMany({
      where: { businessId, startedAt: { gte: monthStart } },
      select: {
        status: true,
        startedAt: true,
        endedAt: true,
        voiceAgentVersionId: true,
        providerCost: true,
        providerCostUnit: true,
        providerCostCheckedAt: true,
        quotaRejectedAt: true,
        _count: {
          select: { humanAgentAssignments: { where: { status: 'connected' } } },
        },
      },
    });
    let seconds = 0;
    const cost = new Map<string, number>();
    for (const call of calls) {
      if (call.endedAt)
        seconds += Math.max(
          0,
          (call.endedAt.getTime() - call.startedAt.getTime()) / 1000,
        );
      if (call.providerCostCheckedAt && call.providerCost) {
        const unit = call.providerCostUnit ?? 'unit not recorded';
        cost.set(unit, (cost.get(unit) ?? 0) + Number(call.providerCost));
      }
    }
    const [dialAttempts, callbackAttempts, business] = await Promise.all([
      this.tenantPrisma.client.voiceOutboundDialAttempt.count({
        where: {
          businessId,
          createdAt: { gte: monthStart },
          customerDialed: true,
        },
      }),
      this.tenantPrisma.client.voiceCallbackAttempt.count({
        where: {
          businessId,
          createdAt: { gte: monthStart },
          customerDialed: true,
        },
      }),
      this.tenantPrisma.client.business.findUnique({
        where: { id: businessId },
        select: { policies: true },
      }),
    ]);
    const maxInboundCallsPerMonth = resolvePolicies(business).num(
      'voice.maxInboundCallsPerMonth',
    );
    const automatedCalls = calls.filter((call) => !call.quotaRejectedAt).length;
    const quotaRejectedCalls = calls.filter(
      (call) => call.quotaRejectedAt,
    ).length;
    return {
      periodStart: monthStart.toISOString(),
      inboundCalls: calls.length,
      missedCalls: calls.filter(
        (call) => call.status === PhoneCallStatus.missed,
      ).length,
      callsWithAiAgent: calls.filter((call) => call.voiceAgentVersionId).length,
      callsWithHumanConnected: calls.filter(
        (call) => call._count.humanAgentAssignments > 0,
      ).length,
      inboundMinutes: Math.round(seconds / 60),
      outboundDials: dialAttempts,
      callbackDials: callbackAttempts,
      providerCharges: [...cost.entries()].map(([unit, amount]) => ({
        unit,
        amount: amount.toFixed(4),
      })),
      limits: {
        usageCaps:
          maxInboundCallsPerMonth === null
            ? ('not_configured' as const)
            : ('inbound_calls_enforced' as const),
        maxInboundCallsPerMonth,
        automatedCalls,
        quotaRejectedCalls,
        note:
          maxInboundCallsPerMonth === null
            ? 'No monthly automated-call cap is configured. Inbound minutes, outbound dials and call-back dials are measured only.'
            : `The automated receptionist admits up to ${maxInboundCallsPerMonth} inbound calls per UTC month. Capped calls skip AI and IVR and are routed to a human when available. Inbound minutes, outbound dials and call-back dials are measured only.`,
      },
    };
  }
}
