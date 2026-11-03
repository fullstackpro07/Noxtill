import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhoneCallStatus } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceAiOutboundService } from './voice-ai-outbound.service';
import { VoiceCallService } from './voice-call.service';

const MIN_CALL_AGE_MS = 2 * 60 * 1000;
const RECHECK_AFTER_MS = 5 * 60 * 1000;
const MAX_CALLS_PER_TICK = 50;
const PROVIDER_CONCURRENCY = 5;
const TERMINAL_STATUSES = new Set([
  'completed',
  'no-answer',
  'busy',
  'failed',
  'canceled',
]);

interface TwilioCallResource {
  status?: unknown;
  duration?: unknown;
}

/**
 * Repairs phone-call state when a terminal Twilio status callback was lost.
 * This system worker reads provider state; it never places or redirects calls.
 */
@Injectable()
export class VoiceCallReconciliationService {
  private readonly logger = new Logger(VoiceCallReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly calls: VoiceCallService,
    private readonly aiOutbound: VoiceAiOutboundService,
  ) {}

  async reconcileStaleCalls(now = new Date(), businessId?: string) {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      return { checked: 0, reconciled: 0, failed: 0, notConfigured: true };
    }

    const staleBefore = new Date(now.getTime() - MIN_CALL_AGE_MS);
    const retryBefore = new Date(now.getTime() - RECHECK_AFTER_MS);
    const candidates = await this.prisma.phoneCall.findMany({
      where: {
        ...(businessId ? { businessId } : {}),
        status: PhoneCallStatus.in_progress,
        endedAt: null,
        startedAt: { lt: staleBefore },
        OR: [
          { providerStatusCheckedAt: null },
          { providerStatusCheckedAt: { lt: retryBefore } },
        ],
      },
      orderBy: [
        { providerStatusCheckedAt: 'asc' },
        { startedAt: 'asc' },
        { id: 'asc' },
      ],
      take: MAX_CALLS_PER_TICK,
      select: {
        id: true,
        businessId: true,
        callSid: true,
        aiOutboundAttempt: { select: { id: true } },
      },
    });

    const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls`;
    const result = {
      checked: 0,
      reconciled: 0,
      failed: 0,
      notConfigured: false,
    };
    for (
      let offset = 0;
      offset < candidates.length;
      offset += PROVIDER_CONCURRENCY
    ) {
      const batch = candidates.slice(offset, offset + PROVIDER_CONCURRENCY);
      await Promise.all(
        batch.map(async (call) => {
          // Atomic claim prevents overlapping workers from making duplicate provider reads.
          const claimed = await this.prisma.phoneCall.updateMany({
            where: {
              id: call.id,
              businessId: call.businessId,
              status: PhoneCallStatus.in_progress,
              endedAt: null,
              startedAt: { lt: staleBefore },
              OR: [
                { providerStatusCheckedAt: null },
                { providerStatusCheckedAt: { lt: retryBefore } },
              ],
            },
            data: { providerStatusCheckedAt: now },
          });
          if (claimed.count !== 1) return;
          result.checked += 1;

          try {
            const response = await axios.get<TwilioCallResource>(
              `${baseUrl}/${encodeURIComponent(call.callSid)}.json`,
              {
                auth: { username: accountSid, password: authToken },
                timeout: 8000,
              },
            );
            const providerStatus =
              typeof response.data.status === 'string'
                ? response.data.status.trim().toLowerCase()
                : '';
            if (!TERMINAL_STATUSES.has(providerStatus)) return;

            const duration = Number(response.data.duration);
            const durationSeconds =
              Number.isInteger(duration) && duration >= 0
                ? duration
                : undefined;
            if (call.aiOutboundAttempt) {
              await this.aiOutbound.providerStatus(
                call.aiOutboundAttempt.id,
                call.callSid,
                providerStatus,
                durationSeconds,
              );
            }
            await this.calls.handleStatus(call.callSid, providerStatus);
            result.reconciled += 1;
          } catch (error) {
            result.failed += 1;
            const status = axios.isAxiosError(error)
              ? error.response?.status
              : undefined;
            this.logger.warn(
              `Could not reconcile provider status for voice call ${call.id}${status ? ` (HTTP ${status})` : ''}; it will be retried after the cooldown.`,
            );
          }
        }),
      );
    }

    return result;
  }
}
