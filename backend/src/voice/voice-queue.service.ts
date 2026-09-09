import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PhoneCallOutcome, PhoneCallStatus } from '@prisma/client';

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
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

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

  async list() {
    const [items, resolvedSample] = await Promise.all([
      this.tenantPrisma.client.phoneCall.findMany({
        where: this.pendingWhere(),
        orderBy: { startedAt: 'asc' },
      }),
      this.tenantPrisma.client.phoneCall.findMany({
        where: { resolvedAt: { not: null } },
        orderBy: { resolvedAt: 'desc' },
        take: RESOLUTION_HISTORY_SAMPLE,
        select: { startedAt: true, resolvedAt: true },
      }),
    ]);

    return {
      items: items.map((call, i) => ({
        id: call.id,
        position: i + 1,
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

  async take(businessId: string, id: string) {
    await this.findPending(businessId, id);
    return this.tenantPrisma.client.phoneCall.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });
  }

  async offerCallback(businessId: string, id: string) {
    await this.findPending(businessId, id);
    return this.tenantPrisma.client.phoneCall.update({
      where: { id },
      data: { callbackRequestedAt: new Date() },
    });
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
}
