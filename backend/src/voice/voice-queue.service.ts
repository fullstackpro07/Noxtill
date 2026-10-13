import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { PhoneCallOutcome, PhoneCallStatus } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TOPICS, type TopicKey } from './voice-analysis';

const MIN_SAMPLES_FOR_ESTIMATE = 3;
const RESOLUTION_HISTORY_SAMPLE = 20;

interface CallTurn {
  speaker: 'caller' | 'assistant';
  text: string;
  at: string;
}

/**
 * Call Queue (UPD-BE-129) — real operational queue of calls needing human follow-up, not a
 * literal on-hold-phone-line queue (every call is answered immediately by the AI receptionist;
 * there's no ringing/waiting-on-hold state to represent). A "queue item" is any call whose real
 * outcome needed a human (`message`/`custom`) or that went unanswered (`missed`), and that hasn't
 * been marked resolved yet. "Estimated wait" is the real average resolution time over this
 * business's own recent history — null (not a guess) until there are at least
 * `MIN_SAMPLES_FOR_ESTIMATE` real resolved samples to average.
 */
@Injectable()
export class VoiceQueueService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  private pendingWhere() {
    return {
      resolvedAt: null,
      OR: [
        { status: PhoneCallStatus.missed },
        { outcome: PhoneCallOutcome.message },
        { outcome: PhoneCallOutcome.custom },
      ],
    };
  }

  async list(businessId?: string) {
    const [items, resolvedSample] = await Promise.all([
      this.tenantPrisma.client.phoneCall.findMany({
        where: {
          ...this.pendingWhere(),
          ...(businessId ? { businessId } : {}),
        },
        orderBy: { startedAt: 'asc' },
      }),
      this.tenantPrisma.client.phoneCall.findMany({
        where: {
          resolvedAt: { not: null },
          ...(businessId ? { businessId } : {}),
        },
        orderBy: { resolvedAt: 'desc' },
        take: RESOLUTION_HISTORY_SAMPLE,
        select: { startedAt: true, resolvedAt: true },
      }),
    ]);

    return {
      queueId: businessId ?? null,
      items: [...items]
        .sort(
          (a, b) =>
            Number(b.status === PhoneCallStatus.missed) -
              Number(a.status === PhoneCallStatus.missed) ||
            a.startedAt.getTime() - b.startedAt.getTime(),
        )
        .map((call, i) => ({
          id: call.id,
          position: i + 1,
          priority: call.status === PhoneCallStatus.missed ? 'high' : 'normal',
          requiredSkill: this.requiredSkill(
            call.customIntentName,
            call.transcript,
          ),
          language: null,
          fromNumber: call.fromNumber,
          status: call.status,
          outcome: call.outcome,
          customIntentName: call.customIntentName,
          startedAt: call.startedAt,
          callbackRequestedAt: call.callbackRequestedAt,
          lastMessage: this.lastAssistantOrCallerLine(call.transcript),
        })),
      estimatedWaitMinutes: this.estimateWaitMinutes(resolvedSample),
    };
  }

  /** Claims one existing follow-up task for the signed-in, available voice agent. */
  async takeNext(businessId: string, queueId: string, userId: string) {
    if (queueId !== businessId) {
      throw new AppException(
        'VOICE_QUEUE_NOT_FOUND',
        'Follow-up queue not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const profile =
      await this.tenantPrisma.client.voiceHumanAgentProfile.findFirst({
        where: {
          businessId,
          active: true,
          presenceStatus: 'available',
          lastHeartbeatAt: { gte: new Date(Date.now() - 90_000) },
          staffUser: { is: { userId, active: true } },
        },
        select: { id: true, skillTags: true },
      });
    if (!profile) {
      throw new AppException(
        'VOICE_AGENT_UNAVAILABLE',
        'Set your voice-agent status to Available before taking the next call',
        HttpStatus.CONFLICT,
      );
    }

    const candidates = await this.tenantPrisma.client.phoneCall.findMany({
      where: {
        businessId,
        assignedToUserId: null,
        ...this.pendingWhere(),
      },
      orderBy: { startedAt: 'asc' },
      take: 100,
      select: {
        id: true,
        callSid: true,
        status: true,
        customIntentName: true,
        transcript: true,
        startedAt: true,
      },
    });
    const profileSkills = this.jsonStrings(profile.skillTags);
    const ordered = candidates
      .map((call) => ({
        call,
        requiredSkill: this.requiredSkill(
          call.customIntentName,
          call.transcript,
        ),
      }))
      .filter(({ requiredSkill }) =>
        !requiredSkill || profileSkills.length === 0
          ? true
          : profileSkills.some(
              (skill) => skill.toLowerCase() === requiredSkill.toLowerCase(),
            ),
      )
      .sort(
        (a, b) =>
          Number(b.call.status === PhoneCallStatus.missed) -
            Number(a.call.status === PhoneCallStatus.missed) ||
          a.call.startedAt.getTime() - b.call.startedAt.getTime(),
      );

    for (const candidate of ordered) {
      const claimed = await this.tenantPrisma.client.$transaction(
        async (tx) => {
          await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM phone_calls WHERE id = ${candidate.call.id} FOR UPDATE
        `;
          return tx.phoneCall.updateMany({
            where: {
              id: candidate.call.id,
              businessId,
              assignedToUserId: null,
              ...this.pendingWhere(),
            },
            data: { assignedToUserId: userId },
          });
        },
      );
      if (claimed.count !== 1) continue;
      await this.audit.log({
        entity: 'PhoneCall',
        entityId: candidate.call.id,
        action: 'call.follow_up_taken_from_queue',
        after: {
          userId,
          profileId: profile.id,
          requiredSkill: candidate.requiredSkill,
        },
      });
      return { id: candidate.call.id, assignedToUserId: userId };
    }

    throw new AppException(
      'VOICE_QUEUE_EMPTY',
      profileSkills.length
        ? 'No unassigned follow-up matches your saved voice skills'
        : 'No unassigned follow-up calls are waiting',
      HttpStatus.NOT_FOUND,
    );
  }

  async take(businessId: string, id: string) {
    await this.findPending(businessId, id);
    const updated = await this.tenantPrisma.client.phoneCall.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: id,
      action: 'call.marked_handled',
    });
    return updated;
  }

  async offerCallback(businessId: string, id: string) {
    await this.findPending(businessId, id);
    const updated = await this.tenantPrisma.client.phoneCall.update({
      where: { id },
      data: { callbackRequestedAt: new Date() },
    });
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: id,
      action: 'call.callback_offered',
    });
    return updated;
  }

  /** Bulk-resolves every currently pending item in one action. */
  async clear(businessId: string): Promise<{ cleared: number }> {
    const result = await this.tenantPrisma.client.phoneCall.updateMany({
      where: { businessId, ...this.pendingWhere() },
      data: { resolvedAt: new Date() },
    });
    return { cleared: result.count };
  }

  private async findPending(businessId: string, id: string) {
    const call = await this.tenantPrisma.client.phoneCall.findUnique({
      where: { id },
    });
    if (!call || call.businessId !== businessId) {
      throw new NotFoundException('Queued call not found');
    }
    return call;
  }

  private estimateWaitMinutes(
    resolved: { startedAt: Date; resolvedAt: Date | null }[],
  ): number | null {
    if (resolved.length < MIN_SAMPLES_FOR_ESTIMATE) return null;
    const totalMinutes = resolved.reduce(
      (sum, r) =>
        sum + (r.resolvedAt!.getTime() - r.startedAt.getTime()) / 60000,
      0,
    );
    return Math.round(totalMinutes / resolved.length);
  }

  private lastAssistantOrCallerLine(transcript: unknown): string | null {
    const turns = (transcript as CallTurn[] | null) ?? [];
    return turns.length > 0 ? turns[turns.length - 1].text : null;
  }

  private requiredSkill(
    customIntentName: string | null,
    transcript: unknown,
  ): string | null {
    if (customIntentName) return customIntentName;
    const turns = (transcript as CallTurn[] | null) ?? [];
    for (const turn of [...turns].reverse()) {
      const topic = (turn as CallTurn & { analysis?: { topic?: unknown } })
        .analysis?.topic;
      if (typeof topic === 'string' && topic in TOPICS) {
        return TOPICS[topic as TopicKey];
      }
    }
    return null;
  }

  private jsonStrings(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }
}
