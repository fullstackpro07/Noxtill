import { HttpStatus, Injectable } from '@nestjs/common';
import {
  PhoneCallStatus,
  Role,
  VoiceAgentPresenceStatus,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { AuditService } from '../common/audit/audit.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  VOICE_ERROR_CODES,
  VOICE_PRESENCE_TTL_SECONDS,
} from './voice.constants';
import {
  SaveVoiceHumanAgentProfileDto,
  VoicePresenceHeartbeatDto,
} from './dto/voice-agent.dto';
import { VoiceQueueService } from './voice-queue.service';

const HUMAN_AGENT_ROLES: Role[] = [Role.owner, Role.manager, Role.staff];

@Injectable()
export class VoiceAgentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly queue: VoiceQueueService,
  ) {}

  async list(businessId: string, actorUserId: string) {
    const [profiles, staff, liveCalls, assignments, queue] = await Promise.all([
      this.tenantPrisma.client.voiceHumanAgentProfile.findMany({
        where: { businessId },
        include: {
          staffUser: {
            select: {
              id: true,
              userId: true,
              role: true,
              active: true,
              user: { select: { id: true, name: true, phone: true } },
            },
          },
        },
        orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      }),
      this.tenantPrisma.client.businessUser.findMany({
        where: {
          businessId,
          active: true,
          role: { in: HUMAN_AGENT_ROLES },
        },
        select: {
          id: true,
          role: true,
          user: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.tenantPrisma.client.phoneCall.findMany({
        where: { businessId, status: PhoneCallStatus.in_progress },
        select: { id: true, joinedByUserId: true },
      }),
      this.tenantPrisma.client.voiceHumanAgentAssignment.findMany({
        where: {
          businessId,
          status: { in: ['offered', 'connected'] },
          OR: [
            { status: 'connected' },
            { expiresAt: { gt: new Date() } },
            { providerDispatchState: { in: ['requested', 'uncertain'] } },
          ],
        },
        select: { profileId: true, callId: true },
      }),
      this.queue.list(),
    ]);

    const now = Date.now();
    const profileStaffIds = new Set(
      profiles.map((profile) => profile.staffUserId),
    );
    const activeProfiles = profiles.filter(
      (profile) => profile.active && profile.staffUser.active,
    );
    const callsByUserId = new Map<string, string[]>();
    for (const call of liveCalls) {
      if (call.joinedByUserId) {
        callsByUserId.set(call.joinedByUserId, [
          ...(callsByUserId.get(call.joinedByUserId) ?? []),
          call.id,
        ]);
      }
    }
    const callsByProfileId = new Map<string, Set<string>>();
    for (const assignment of assignments) {
      const callIds =
        callsByProfileId.get(assignment.profileId) ?? new Set<string>();
      callIds.add(assignment.callId);
      callsByProfileId.set(assignment.profileId, callIds);
    }

    const agents = profiles.map((profile) => {
      const heartbeatMs = profile.lastHeartbeatAt?.getTime() ?? 0;
      const heartbeatFresh =
        heartbeatMs > 0 &&
        now - heartbeatMs <= VOICE_PRESENCE_TTL_SECONDS * 1000;
      const status =
        profile.active && profile.staffUser.active && heartbeatFresh
          ? profile.presenceStatus
          : VoiceAgentPresenceStatus.offline;
      return {
        id: profile.id,
        staffUserId: profile.staffUserId,
        userId: profile.staffUser.userId,
        name: profile.staffUser.user.name,
        phone: profile.staffUser.user.phone,
        role: profile.staffUser.role,
        skillTags: this.stringList(profile.skillTags),
        languages: this.stringList(profile.languages),
        maxConcurrentCalls: profile.maxConcurrentCalls,
        active: profile.active && profile.staffUser.active,
        presenceStatus: status,
        lastHeartbeatAt: profile.lastHeartbeatAt?.toISOString() ?? null,
        presenceExpired:
          profile.presenceStatus !== VoiceAgentPresenceStatus.offline &&
          !heartbeatFresh,
        liveCalls: new Set([
          ...(callsByUserId.get(profile.staffUser.userId) ?? []),
          ...(callsByProfileId.get(profile.id) ?? new Set<string>()),
        ]).size,
        isSelf: profile.staffUser.userId === actorUserId,
      };
    });
    const available = agents.filter(
      (agent) =>
        agent.active &&
        agent.presenceStatus === VoiceAgentPresenceStatus.available,
    ).length;

    return {
      metrics: {
        humanAgents: activeProfiles.length,
        markedAvailable: available,
        ongoingCalls: liveCalls.length,
        followUpsWaiting: queue.items.length,
        configuredConcurrency: activeProfiles.reduce(
          (sum, profile) => sum + profile.maxConcurrentCalls,
          0,
        ),
        expiredPresence: agents.filter((agent) => agent.presenceExpired).length,
      },
      agents,
      staffOptions: staff
        .filter((member) => !profileStaffIds.has(member.id))
        .map((member) => ({
          id: member.id,
          userId: member.user.id,
          name: member.user.name,
          phone: member.user.phone,
          role: member.role,
        })),
      limitations: {
        browserSoftphone: 'not_configured',
        queueMembership: 'not_configured',
        presenceBasedAssignment: 'automatic_ai_transfer_only',
        skillRouting: 'classified_topic_preference_with_general_fallback',
        presenceTtlSeconds: VOICE_PRESENCE_TTL_SECONDS,
      },
    };
  }

  async saveProfile(
    businessId: string,
    staffUserId: string,
    dto: SaveVoiceHumanAgentProfileDto,
  ) {
    const member = await this.tenantPrisma.client.businessUser.findFirst({
      where: {
        id: staffUserId,
        businessId,
        active: true,
        role: { in: HUMAN_AGENT_ROLES },
      },
      select: { id: true, user: { select: { name: true } } },
    });
    if (!member) {
      throw new AppException(
        VOICE_ERROR_CODES.STAFF_NOT_ELIGIBLE,
        'Choose an active staff member from this business',
        HttpStatus.NOT_FOUND,
      );
    }

    const key = { businessId_staffUserId: { businessId, staffUserId } };
    const before =
      await this.tenantPrisma.client.voiceHumanAgentProfile.findUnique({
        where: key,
      });
    const skillTags = this.normalizeList(dto.skillTags);
    const languages = this.normalizeList(dto.languages);
    const profile =
      await this.tenantPrisma.client.voiceHumanAgentProfile.upsert({
        where: key,
        create: {
          businessId,
          staffUserId,
          skillTags,
          languages,
          maxConcurrentCalls: dto.maxConcurrentCalls,
          active: dto.active ?? true,
        },
        update: {
          skillTags,
          languages,
          maxConcurrentCalls: dto.maxConcurrentCalls,
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.active === false
            ? {
                presenceStatus: VoiceAgentPresenceStatus.offline,
                lastHeartbeatAt: null,
              }
            : {}),
        },
      });
    await this.audit.log({
      entity: 'VoiceHumanAgentProfile',
      entityId: profile.id,
      action: before
        ? 'voice.human_profile_updated'
        : 'voice.human_profile_created',
      before: before
        ? {
            skillTags: this.stringList(before.skillTags),
            languages: this.stringList(before.languages),
            maxConcurrentCalls: before.maxConcurrentCalls,
            active: before.active,
          }
        : undefined,
      after: {
        staffName: member.user.name,
        skillTags,
        languages,
        maxConcurrentCalls: profile.maxConcurrentCalls,
        active: profile.active,
      },
    });
    return {
      id: profile.id,
      staffUserId: profile.staffUserId,
      name: member.user.name,
      skillTags,
      languages,
      maxConcurrentCalls: profile.maxConcurrentCalls,
      active: profile.active,
    };
  }

  async heartbeat(
    businessId: string,
    actorUserId: string,
    dto: VoicePresenceHeartbeatDto,
  ) {
    const member = await this.tenantPrisma.client.businessUser.findUnique({
      where: { businessId_userId: { businessId, userId: actorUserId } },
      select: { id: true, active: true },
    });
    if (!member?.active) {
      throw new AppException(
        VOICE_ERROR_CODES.HUMAN_AGENT_NOT_FOUND,
        'An active staff profile is required to set call presence',
        HttpStatus.NOT_FOUND,
      );
    }
    const profile =
      await this.tenantPrisma.client.voiceHumanAgentProfile.findUnique({
        where: {
          businessId_staffUserId: { businessId, staffUserId: member.id },
        },
      });
    if (!profile?.active) {
      throw new AppException(
        VOICE_ERROR_CODES.HUMAN_AGENT_NOT_FOUND,
        'You are not assigned as a voice agent for this business',
        HttpStatus.NOT_FOUND,
      );
    }

    const changed = profile.presenceStatus !== dto.status;
    const lastHeartbeatAt =
      dto.status === VoiceAgentPresenceStatus.offline ? null : new Date();
    const updated =
      await this.tenantPrisma.client.voiceHumanAgentProfile.update({
        where: { id: profile.id },
        data: { presenceStatus: dto.status, lastHeartbeatAt },
      });
    if (changed) {
      await this.audit.log({
        entity: 'VoiceHumanAgentProfile',
        entityId: profile.id,
        action: 'voice.presence_changed',
        before: { status: profile.presenceStatus },
        after: { status: updated.presenceStatus },
      });
    }
    return {
      status: updated.presenceStatus,
      lastHeartbeatAt: updated.lastHeartbeatAt?.toISOString() ?? null,
      expiresInSeconds:
        updated.presenceStatus === VoiceAgentPresenceStatus.offline
          ? 0
          : VOICE_PRESENCE_TTL_SECONDS,
    };
  }

  private normalizeList(values: string[]): string[] {
    const seen = new Set<string>();
    return values
      .map((value) => value.trim())
      .filter((value) => {
        const key = value.toLocaleLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  private stringList(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }
}
