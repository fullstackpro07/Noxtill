import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PhoneCallOutcome, PhoneCallStatus } from '@prisma/client';

/** Call history, missed-call recovery funnel, and analytics (UPD-BE-059) — all thin reads over the real `PhoneCall` log. */
@Injectable()
export class VoiceQueryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  listCalls() {
    return this.tenantPrisma.client.phoneCall.findMany({
      orderBy: { startedAt: 'desc' },
      take: 200,
      include: { appointment: true },
    });
  }

  listMissedCalls() {
    return this.tenantPrisma.client.phoneCall.findMany({
      where: { status: PhoneCallStatus.missed },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });
  }

  async analytics() {
    const calls = await this.tenantPrisma.client.phoneCall.findMany({
      select: {
        status: true,
        outcome: true,
        startedAt: true,
        endedAt: true,
      },
    });

    const byOutcome: Record<PhoneCallOutcome, number> = {
      none: 0,
      booking: 0,
      message: 0,
      transfer: 0,
    };
    const byStatus: Record<PhoneCallStatus, number> = {
      in_progress: 0,
      completed: 0,
      missed: 0,
      transferred: 0,
    };
    let totalDurationSeconds = 0;
    let endedCount = 0;

    for (const call of calls) {
      byOutcome[call.outcome] += 1;
      byStatus[call.status] += 1;
      if (call.endedAt) {
        totalDurationSeconds +=
          (call.endedAt.getTime() - call.startedAt.getTime()) / 1000;
        endedCount += 1;
      }
    }

    return {
      totalCalls: calls.length,
      byOutcome,
      byStatus,
      averageDurationSeconds:
        endedCount > 0 ? Math.round(totalDurationSeconds / endedCount) : 0,
    };
  }
}
