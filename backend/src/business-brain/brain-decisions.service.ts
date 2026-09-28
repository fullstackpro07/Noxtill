import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

/** The decision log and per-finding state (watching / dismissed). */
@Injectable()
export class BrainDecisionsService {
  constructor(private readonly prisma: PrismaService) {}

  log(
    businessId: string,
    e: {
      findingKey?: string | null;
      actionId?: string | null;
      title: string;
      decision: string;
      reason?: string | null;
      actor?: { id: string | null; name: string | null };
    },
  ) {
    return this.prisma.brainDecision.create({
      data: {
        businessId,
        findingKey: e.findingKey ?? null,
        actionId: e.actionId ?? null,
        title: e.title.slice(0, 255),
        decision: e.decision,
        reason: e.reason ?? null,
        actorUserId: e.actor?.id ?? null,
        actorName: e.actor?.name ?? null,
      },
    });
  }

  private async name(userId: string) {
    return (
      (
        await this.prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        })
      )?.name ?? 'Someone'
    );
  }

  async setState(
    user: AuthenticatedUser,
    key: string,
    status: 'watching' | 'dismissed',
    title: string,
    reason?: string,
  ) {
    const name = await this.name(user.sub);
    await this.prisma.brainFindingState.upsert({
      where: { businessId_key: { businessId: user.businessId, key } },
      create: {
        businessId: user.businessId,
        key,
        status,
        title: title.slice(0, 255),
        reason: reason ?? null,
        actorUserId: user.sub,
        actorName: name,
      },
      update: {
        status,
        title: title.slice(0, 255),
        reason: reason ?? null,
        actorUserId: user.sub,
        actorName: name,
      },
    });
    await this.log(user.businessId, {
      findingKey: key,
      title,
      decision: status === 'watching' ? 'watched' : 'dismissed',
      reason,
      actor: { id: user.sub, name },
    });
  }

  async restore(user: AuthenticatedUser, key: string) {
    const state = await this.prisma.brainFindingState.findUnique({
      where: { businessId_key: { businessId: user.businessId, key } },
    });
    if (!state) return;
    await this.prisma.brainFindingState.delete({ where: { id: state.id } });
    await this.log(user.businessId, {
      findingKey: key,
      title: state.title,
      decision: 'restored',
      actor: { id: user.sub, name: await this.name(user.sub) },
    });
  }

  async logList(businessId: string, take = 100) {
    return this.prisma.brainDecision.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async states(businessId: string) {
    return this.prisma.brainFindingState.findMany({
      where: { businessId },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
