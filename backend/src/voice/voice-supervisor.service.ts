import { HttpStatus, Injectable } from '@nestjs/common';
import { PhoneCallStatus, VoiceAgentPresenceStatus } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { VoiceAgentsService } from './voice-agents.service';
import { handledBy, type CallTurn } from './voice-insights.service';
import { summariseCallAnalysis } from './voice-analysis';
import { VoiceCallQueueService } from './voice-call-queue.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';

/** A privacy-minimised, tenant-scoped live operations view. */
@Injectable()
export class VoiceSupervisorService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly agentsService: VoiceAgentsService,
    private readonly callQueue: VoiceCallQueueService,
    private readonly audit: AuditService,
  ) {}

  async live(businessId: string, actorUserId: string) {
    const [business, liveCalls, roster, queueStats] = await Promise.all([
      this.tenantPrisma.client.business.findUnique({
        where: { id: businessId },
        select: { timezone: true },
      }),
      this.tenantPrisma.client.phoneCall.findMany({
        where: { businessId, status: PhoneCallStatus.in_progress },
        orderBy: { startedAt: 'asc' },
        select: {
          id: true,
          fromNumber: true,
          status: true,
          outcome: true,
          startedAt: true,
          recordingKey: true,
          recordingDeletedAt: true,
          transcript: true,
          joinedAt: true,
          joinedByUserId: true,
        },
      }),
      this.agentsService.list(businessId, actorUserId),
      this.callQueue.supervisorStats(businessId),
    ]);
    const activeAssignments = liveCalls.length
      ? await this.tenantPrisma.client.voiceHumanAgentAssignment.findMany({
          where: {
            businessId,
            callId: { in: liveCalls.map((call) => call.id) },
            status: 'connected',
            connected: true,
            providerCallSid: { not: null },
            conferenceSid: { not: null },
          },
          orderBy: [{ attemptNumber: 'desc' }, { createdAt: 'desc' }],
          select: {
            callId: true,
            attemptNumber: true,
            profile: {
              select: {
                staffUser: {
                  select: { user: { select: { name: true } } },
                },
              },
            },
          },
        })
      : [];
    const activeAgentByCallId = new Map(
      activeAssignments.map((assignment) => [assignment.callId, assignment]),
    );

    const nameByUserId = new Map(
      roster.agents.map((agent) => [agent.userId, agent.name]),
    );
    const calls = liveCalls.map((call) => {
      const transcript = (call.transcript as unknown as CallTurn[]) ?? [];
      const analysis = summariseCallAnalysis(transcript);
      const activeAssignment = activeAgentByCallId.get(call.id);
      return {
        id: call.id,
        caller: this.maskCaller(call.fromNumber),
        startedAt: call.startedAt.toISOString(),
        elapsedSeconds: Math.max(
          0,
          Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000),
        ),
        handler: handledBy(call),
        sentiment: analysis.sentiment,
        confidence: analysis.confidence,
        lowConfidenceTurns: analysis.lowConfidenceTurns,
        recording: call.recordingKey
          ? 'saved'
          : call.recordingDeletedAt
            ? 'deleted'
            : 'not_saved_yet',
        joinedAt: call.joinedAt?.toISOString() ?? null,
        joinedByName: call.joinedByUserId
          ? (nameByUserId.get(call.joinedByUserId) ?? null)
          : null,
        activeHumanAgent: activeAssignment
          ? {
              name: activeAssignment.profile.staffUser.user.name,
              attemptNumber: activeAssignment.attemptNumber,
            }
          : null,
      };
    });
    const agents = roster.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      status: agent.presenceStatus,
      active: agent.active,
      skills: agent.skillTags,
      languages: agent.languages,
      liveCalls: agent.liveCalls,
      maxConcurrentCalls: agent.maxConcurrentCalls,
      presenceExpired: agent.presenceExpired,
    }));

    return {
      generatedAt: new Date().toISOString(),
      timezone: business?.timezone ?? 'UTC',
      metrics: {
        activeCalls: calls.length,
        onlineAgents: agents.filter(
          (agent) => agent.status !== VoiceAgentPresenceStatus.offline,
        ).length,
        availableAgents: roster.metrics.markedAvailable,
        busyAgents: agents.filter(
          (agent) => agent.status === VoiceAgentPresenceStatus.busy,
        ).length,
        callbackBacklog: roster.metrics.followUpsWaiting,
        configuredCapacity: roster.metrics.configuredConcurrency,
        ...queueStats.metrics,
        aiErrors: null,
      },
      calls,
      agents,
      queues: queueStats.queues,
      limitations: {
        waitingCalls:
          'Only callers placed in the configured Twilio <Enqueue> queue are counted. The estimate is based on this queue’s recent measured Twilio waits.',
        aiErrors:
          'Not tracked: live AI runtime errors are not persisted as a supervisor metric.',
        language:
          'Not tracked: call language is not persisted on the call record.',
        whisperAndBarge:
          'Whisper and barge are available only while an internal voice agent is connected through a shared Twilio conference. External-number transfers are not coachable. Joining a call still rings the supervisor phone; it is not a silent tap.',
        monitoring:
          'Join muted rings the supervisor phone and moves the caller into a conference; it is not a silent tap and the AI turn-based loop stops. Take over joins unmuted.',
        identity:
          'Caller numbers are masked here. Full call details remain in the existing Live Calls workspace.',
      },
    };
  }

  async setQueueSlaTarget(
    businessId: string,
    actorUserId: string,
    queueKey: string,
    slaTargetSeconds: number | null | undefined,
  ) {
    if (queueKey !== 'support') {
      throw new AppException(
        'VOICE_QUEUE_NOT_FOUND',
        'This voice queue was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      slaTargetSeconds !== undefined &&
      slaTargetSeconds !== null &&
      (!Number.isInteger(slaTargetSeconds) ||
        slaTargetSeconds < 30 ||
        slaTargetSeconds > 3600)
    ) {
      throw new AppException(
        'VOICE_QUEUE_SLA_INVALID',
        'Set the wait target to a whole number from 30 to 3600 seconds, or clear it.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const queueName = this.callQueue.queueNameForBusiness(businessId);
    const previous =
      await this.tenantPrisma.client.voiceCallQueueConfig.findFirst({
        where: { businessId, queueName },
      });
    const saved = await this.tenantPrisma.client.voiceCallQueueConfig.upsert({
      where: { businessId_queueName: { businessId, queueName } },
      create: {
        businessId,
        queueName,
        slaTargetSeconds: slaTargetSeconds ?? null,
        updatedByUserId: actorUserId,
      },
      update: {
        slaTargetSeconds: slaTargetSeconds ?? null,
        updatedByUserId: actorUserId,
      },
    });
    await this.audit.log({
      entity: 'VoiceCallQueueConfig',
      entityId: saved.id,
      action: 'voice.queue_sla_updated',
      before: { slaTargetSeconds: previous?.slaTargetSeconds ?? null },
      after: {
        queue: queueKey,
        slaTargetSeconds: saved.slaTargetSeconds,
        actorUserId,
      },
    });
    return {
      queue: queueKey,
      slaTargetSeconds: saved.slaTargetSeconds,
    };
  }

  private maskCaller(value: string): string {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••';
  }
}
