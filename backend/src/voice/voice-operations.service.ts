import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const percentile95 = (samples: number[]) =>
  samples.length
    ? [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1]
    : null;

/** Operational measurements from actual saved sessions; no asserted availability SLA. */
@Injectable()
export class VoiceOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(businessId: string) {
    const since = new Date(Date.now() - 86400000);
    const [sessions, activeCalls, pendingUsage, controlRequests] =
      await Promise.all([
        this.prisma.voiceRealtimeSession.findMany({
          where: {
            businessId,
            createdAt: { gte: since },
            call: { isTestCall: false },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 1000,
          select: { status: true, errorCode: true, metrics: true },
        }),
        this.prisma.phoneCall.count({
          where: { businessId, status: 'in_progress', isTestCall: false },
        }),
        this.prisma.voiceUsageRecord.count({
          where: {
            businessId,
            provider: 'openai',
            state: 'pending',
            measuredAt: { lt: new Date(Date.now() - 3600000) },
          },
        }),
        this.prisma.voiceUsageRecord.findMany({
          where: {
            businessId,
            unit: 'control_request_latency_ms',
            measuredAt: { gte: since },
          },
          select: { quantity: true, evidence: true },
          orderBy: [{ measuredAt: 'desc' }, { id: 'asc' }],
          take: 10000,
        }),
      ]);
    const latencies: number[] = [];
    let interruptions = 0;
    for (const session of sessions) {
      const metrics = session.metrics as {
        firstAudioLatencySamplesMs?: unknown;
        interruptions?: unknown;
      };
      if (Array.isArray(metrics.firstAudioLatencySamplesMs))
        latencies.push(
          ...metrics.firstAudioLatencySamplesMs.filter(
            (n): n is number =>
              typeof n === 'number' && Number.isFinite(n) && n >= 0,
          ),
        );
      if (typeof metrics.interruptions === 'number')
        interruptions += metrics.interruptions;
    }
    return {
      since: since.toISOString(),
      measuredAt: new Date().toISOString(),
      activeCalls,
      sessions: sessions.length,
      completed: sessions.filter((s) => s.status === 'completed').length,
      failed: sessions.filter((s) => s.status === 'failed').length,
      interruptions,
      firstAudioP95Ms: percentile95(latencies),
      latencySamples: latencies.length,
      controlRequestSamples: controlRequests.length,
      controlRequestP95Ms: percentile95(
        controlRequests.map((r) => Number(r.quantity)),
      ),
      controlRequestFailures: controlRequests.filter(
        (r) => (r.evidence as { failed?: boolean }).failed === true,
      ).length,
      controlSampleLimited: controlRequests.length === 10000,
      pendingUsageOlderThanHour: pendingUsage,
      instanceUptimeSeconds: Math.floor(process.uptime()),
      sampleLimited: sessions.length === 1000,
      availabilityNote:
        'Historical uptime and carrier availability are not tracked until an external deployment probe is configured.',
      errors: sessions.filter((s) => s.errorCode).map((s) => s.errorCode!),
    };
  }

  async checkAlerts(now = new Date()) {
    const groups = await this.prisma.voiceRealtimeSession.groupBy({
      by: ['businessId'],
      where: {
        status: 'failed',
        finishedAt: { gte: new Date(now.getTime() - 10 * 60000) },
        call: { isTestCall: false },
      },
      _count: true,
    });
    for (const group of groups) {
      if (group._count < 3) continue;
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${group.businessId} FOR UPDATE`;
        const eventKey = `operations:failures:${now.toISOString().slice(0, 13)}`;
        if (
          await tx.voiceUsageRecord.findUnique({
            where: {
              businessId_eventKey: { businessId: group.businessId, eventKey },
            },
          })
        )
          return;
        await tx.voiceUsageRecord.create({
          data: {
            businessId: group.businessId,
            eventKey,
            provider: 'noxtill',
            unit: 'operations_alert',
            quantity: group._count,
            state: 'observed',
            evidence: {
              type: 'realtime_failure_burst',
              windowMinutes: 10,
              threshold: 3,
            },
          },
        });
        const owners = await tx.businessUser.findMany({
          where: { businessId: group.businessId, role: 'owner', active: true },
          select: { userId: true },
        });
        if (owners.length)
          await tx.notification.createMany({
            data: owners.map((owner) => ({
              businessId: group.businessId,
              userId: owner.userId,
              title: 'Live voice needs attention',
              body: `${group._count} saved audio sessions failed in the last 10 minutes. Review provider readiness and failure codes in Supervisor. This is measured failure evidence, not an uptime estimate.`,
              priority: 'high',
              link: '/phone/supervisor',
            })),
          });
      });
    }
    // Operational request samples are not billing records; keep only a rolling 30 days.
    await this.prisma.voiceUsageRecord.deleteMany({
      where: {
        unit: 'control_request_latency_ms',
        measuredAt: { lt: new Date(now.getTime() - 30 * 86400000) },
      },
    });
  }
}
