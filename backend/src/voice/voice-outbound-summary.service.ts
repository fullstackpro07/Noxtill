import { HttpStatus, Injectable } from '@nestjs/common';
import { VoiceOutboundDialAttemptStatus } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

type Counts = {
  attempts: number;
  blocked: number;
  customerDialed: number;
  connected: number;
  talkSeconds: number;
};

/** Call Overview: outbound activity since a caller-supplied instant (the business's local midnight). */
@Injectable()
export class VoiceOutboundSummaryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async since(businessId: string, fromIso?: string) {
    const from = fromIso
      ? new Date(fromIso)
      : new Date(Date.now() - 86_400_000);
    if (
      !Number.isFinite(from.getTime()) ||
      Date.now() - from.getTime() > 92 * 86_400_000
    ) {
      throw new AppException(
        'VOICE_OUTBOUND_SUMMARY_INVALID',
        'Choose a start within the last 92 days.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const select = {
      status: true,
      customerDialed: true,
      durationSec: true,
    } as const;
    const [dials, callbacks] = await Promise.all([
      this.tenantPrisma.client.voiceOutboundDialAttempt.findMany({
        where: { businessId, createdAt: { gte: from } },
        select,
      }),
      this.tenantPrisma.client.voiceCallbackAttempt.findMany({
        where: { businessId, createdAt: { gte: from } },
        select,
      }),
    ]);
    return {
      from: from.toISOString(),
      powerDialer: this.count(dials),
      callbacks: this.count(callbacks),
    };
  }

  private count(
    rows: {
      status: VoiceOutboundDialAttemptStatus;
      customerDialed: boolean;
      durationSec: number | null;
    }[],
  ): Counts {
    return {
      attempts: rows.length,
      blocked: rows.filter(
        (row) => row.status === VoiceOutboundDialAttemptStatus.blocked,
      ).length,
      customerDialed: rows.filter((row) => row.customerDialed).length,
      connected: rows.filter(
        (row) => row.status === VoiceOutboundDialAttemptStatus.answered,
      ).length,
      talkSeconds: rows.reduce((sum, row) => sum + (row.durationSec ?? 0), 0),
    };
  }
}
