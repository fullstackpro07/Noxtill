import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { PhoneCall } from '@prisma/client';

/**
 * Missed-call recovery (UPD-BE-059) — reuses the existing WhatsApp send pipeline
 * (`SendGateService`) exactly like every other automated message in this app, addressed to the
 * caller's own number rather than a known `Customer` (most missed callers aren't customers yet).
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

    try {
      await this.sendGate.send({
        businessId: call.businessId,
        templateKey: 'missed_call',
        variables: { businessName: business.name },
        to: { phone: call.fromNumber },
      });
    } catch (error) {
      // Best-effort — a failed recovery message must never throw back into the Twilio status webhook.
      this.logger.warn(
        `Missed-call WhatsApp notification failed for call ${call.callSid}: ${(error as Error).message}`,
      );
    }
  }
}
