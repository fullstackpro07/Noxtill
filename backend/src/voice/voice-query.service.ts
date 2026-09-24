import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { AuditService } from '../common/audit/audit.service';
import { PhoneCallOutcome, PhoneCallStatus } from '@prisma/client';

/** Call history, missed-call recovery funnel, and analytics (UPD-BE-059) — all thin reads over the real `PhoneCall` log. */
@Injectable()
export class VoiceQueryService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly s3: S3Service,
    private readonly audit: AuditService,
  ) {}

  listCalls() {
    return this.tenantPrisma.client.phoneCall.findMany({
      orderBy: { startedAt: 'desc' },
      take: 200,
      include: { appointment: true },
    });
  }

  /** Transcripts & Recordings depth fix — a real signed S3 URL (24h TTL, same convention as every other file in this app), not the raw `recordingKey`. */
  async getRecordingUrl(id: string): Promise<{ url: string | null }> {
    const call = await this.tenantPrisma.client.phoneCall.findUnique({
      where: { id },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }
    if (!call.recordingKey) {
      return { url: null };
    }
    const url = await this.s3.getSignedDownloadUrl(call.recordingKey);
    // Every time staff open a recording for playback the access is written to the append-only audit
    // trail — who, which call, when. (The link is logged when it is issued, i.e. when playback starts.)
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: call.id,
      action: 'call.recording_played',
    });
    return { url };
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
      custom: 0,
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
