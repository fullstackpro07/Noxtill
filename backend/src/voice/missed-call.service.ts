import { Injectable, Logger } from '@nestjs/common';
import { PhoneCall } from '@prisma/client';
import { resolvePolicies } from '../common/policies/policies.service';
import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';

export type TextBackStatus =
  | 'queued'
  | 'disabled'
  | 'skipped_suppressed'
  | 'skipped_opted_out'
  | 'skipped_test_call'
  | 'failed';

/**
 * Missed-call recovery (UPD-BE-059) — reuses the existing send pipeline (`SendGateService`) like
 * every other automated message, addressed to the caller's own number. Gated by the owner setting
 * `voice.missedCallTextBack`, never sent to a suppressed number or an opted-out customer, and the
 * outcome plus the created Message are stored on the call so delivery is shown from the provider.
 */
@Injectable()
export class MissedCallService {
  private readonly logger = new Logger(MissedCallService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendGate: SendGateService,
  ) {}

  async notify(call: PhoneCall): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { id: call.businessId },
    });
    if (!business) return;

    const record = (
      textBackStatus: TextBackStatus,
      textBackMessageId?: string,
    ) =>
      this.prisma.phoneCall
        .update({
          where: { id: call.id },
          data: {
            textBackStatus,
            textBackMessageId: textBackMessageId ?? null,
          },
        })
        .catch(() => undefined);

    if (call.isTestCall) {
      await record('skipped_test_call');
      return;
    }
    if (!resolvePolicies(business).bool('voice.missedCallTextBack')) {
      await record('disabled');
      return;
    }
    const now = new Date();
    const suppressed = await this.prisma.voiceSuppressionEntry.findFirst({
      where: {
        businessId: call.businessId,
        phoneE164: call.fromNumber,
        revokedAt: null,
        effectiveAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true },
    });
    if (suppressed) {
      await record('skipped_suppressed');
      return;
    }
    const customer = await this.prisma.customer.findFirst({
      where: { businessId: call.businessId, phone: call.fromNumber },
      select: { id: true, optedOut: true },
    });
    if (customer?.optedOut) {
      await record('skipped_opted_out');
      return;
    }

    try {
      const message = await this.sendGate.send({
        businessId: call.businessId,
        templateKey: 'missed_call',
        variables: { businessName: business.name },
        ...(customer
          ? { customerId: customer.id }
          : { to: { phone: call.fromNumber } }),
        idempotencyKey: `missed-call:${call.id}`,
      });
      await record('queued', message.id);
    } catch (error) {
      // Best-effort — a failed recovery message must never throw back into the Twilio status webhook.
      await record('failed');
      this.logger.warn(
        `Missed-call text-back failed for call ${call.callSid}: ${(error as Error).message}`,
      );
    }
  }
}
