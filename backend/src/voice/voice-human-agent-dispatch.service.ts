import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  PhoneCallStatus,
  VoiceAgentPresenceStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  VOICE_HUMAN_AGENT_MAX_ATTEMPTS,
  VOICE_PRESENCE_TTL_SECONDS,
} from './voice.constants';
import { TOPICS, type TopicKey } from './voice-analysis';
import { voiceSoftphoneIdentity } from './voice-softphone.util';

export interface ReservedHumanAgent {
  assignmentId: string;
  callId: string;
  profileId: string;
  staffUserId: string;
  name: string;
  phone: string;
  attemptNumber: number;
}

/**
 * Reserves fresh, explicitly available Staff voice profiles for AI-to-human call transfers.
 * A row lock on each profile serializes capacity checks; identity still belongs to Staff.
 */
@Injectable()
export class VoiceHumanAgentDispatchService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async reserve(
    businessId: string,
    callId: string,
    preferredTopic?: TopicKey | null,
    preferredStaffUserId?: string | null,
  ): Promise<ReservedHumanAgent | null> {
    const now = new Date();
    const freshSince = new Date(
      now.getTime() - VOICE_PRESENCE_TTL_SECONDS * 1000,
    );
    const softphoneEnabled = this.isSoftphoneConfigured();

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.voiceHumanAgentAssignment.updateMany({
            where: {
              businessId,
              status: 'offered',
              expiresAt: { lte: now },
              OR: [
                { providerDispatchState: null },
                {
                  providerDispatchState: { notIn: ['requested', 'uncertain'] },
                },
              ],
            },
            data: {
              status: 'released',
              providerStatus: 'reservation_timeout',
              releasedAt: now,
            },
          });

          const call = await tx.phoneCall.findFirst({
            where: {
              id: callId,
              businessId,
              status: PhoneCallStatus.in_progress,
            },
            select: { id: true },
          });
          if (!call) return null;

          // Serialize reservations for this call so duplicate provider callbacks cannot
          // create two simultaneous attempts or skip an attempt number.
          await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM phone_calls WHERE id = ${callId} FOR UPDATE
          `;
          const previousAttempts = await tx.voiceHumanAgentAssignment.findMany({
            where: { businessId, callId },
            orderBy: { attemptNumber: 'asc' },
            select: {
              profileId: true,
              attemptNumber: true,
              status: true,
              expiresAt: true,
              providerDispatchState: true,
            },
          });
          if (
            previousAttempts.some(
              (attempt) =>
                attempt.status === 'connected' ||
                (attempt.status === 'offered' &&
                  (['requested', 'uncertain'].includes(
                    attempt.providerDispatchState ?? '',
                  ) ||
                    (attempt.expiresAt?.getTime() ?? 0) > now.getTime())),
            )
          ) {
            return null;
          }
          const attemptNumber =
            Math.max(
              0,
              ...previousAttempts.map((attempt) => attempt.attemptNumber),
            ) + 1;
          if (attemptNumber > VOICE_HUMAN_AGENT_MAX_ATTEMPTS) return null;
          const triedProfileIds = new Set(
            previousAttempts.map((attempt) => attempt.profileId),
          );

          const candidates = await tx.voiceHumanAgentProfile.findMany({
            where: {
              businessId,
              active: true,
              presenceStatus: VoiceAgentPresenceStatus.available,
              lastHeartbeatAt: { gte: freshSince },
              staffUser: {
                is: {
                  active: true,
                  user: {
                    is: softphoneEnabled ? {} : { phone: { not: null } },
                  },
                },
              },
            },
            select: {
              id: true,
              staffUserId: true,
              maxConcurrentCalls: true,
              skillTags: true,
              createdAt: true,
              staffUser: {
                select: {
                  user: { select: { name: true, phone: true } },
                },
              },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          });

          if (candidates.length === 0) return null;

          const loads = await tx.voiceHumanAgentAssignment.groupBy({
            by: ['profileId'],
            where: {
              businessId,
              status: { in: ['offered', 'connected'] },
              OR: [
                { status: 'connected' },
                { expiresAt: { gt: now } },
                { providerDispatchState: { in: ['requested', 'uncertain'] } },
              ],
            },
            _count: { _all: true },
          });
          const outboundLoads = await tx.voiceOutboundDialAttempt.groupBy({
            by: ['agentProfileId'],
            where: {
              businessId,
              status: { in: ['agent_ringing', 'customer_ringing'] },
            },
            _count: { _all: true },
          });
          const callbackLoads = await tx.voiceCallbackAttempt.groupBy({
            by: ['agentProfileId'],
            where: {
              businessId,
              agentProfileId: { not: null },
              status: { in: ['agent_ringing', 'customer_ringing'] },
            },
            _count: { _all: true },
          });
          const loadByProfile = new Map(
            loads.map((load) => [load.profileId, load._count._all]),
          );
          const outboundLoadByProfile = new Map(
            outboundLoads.map((load) => [
              load.agentProfileId,
              load._count._all,
            ]),
          );
          const callbackLoadByProfile = new Map(
            callbackLoads.map((load) => [
              load.agentProfileId!,
              load._count._all,
            ]),
          );
          const ordered = [...candidates].sort((a, b) => {
            const aIsAssignedOwner =
              Boolean(preferredStaffUserId) &&
              a.staffUserId === preferredStaffUserId;
            const bIsAssignedOwner =
              Boolean(preferredStaffUserId) &&
              b.staffUserId === preferredStaffUserId;
            if (aIsAssignedOwner !== bIsAssignedOwner)
              return aIsAssignedOwner ? -1 : 1;

            const aMatchesTopic = this.hasTopicSkill(
              a.skillTags,
              preferredTopic,
            );
            const bMatchesTopic = this.hasTopicSkill(
              b.skillTags,
              preferredTopic,
            );
            if (aMatchesTopic !== bMatchesTopic) return aMatchesTopic ? -1 : 1;

            const aLoad =
              (loadByProfile.get(a.id) ?? 0) +
              (outboundLoadByProfile.get(a.id) ?? 0) +
              (callbackLoadByProfile.get(a.id) ?? 0);
            const bLoad =
              (loadByProfile.get(b.id) ?? 0) +
              (outboundLoadByProfile.get(b.id) ?? 0) +
              (callbackLoadByProfile.get(b.id) ?? 0);
            const utilization =
              aLoad / a.maxConcurrentCalls - bLoad / b.maxConcurrentCalls;
            return (
              utilization ||
              a.createdAt.getTime() - b.createdAt.getTime() ||
              a.id.localeCompare(b.id)
            );
          });

          for (const candidate of ordered) {
            if (triedProfileIds.has(candidate.id)) continue;
            // InnoDB holds this profile row lock until commit. READ COMMITTED below makes the
            // following capacity count see assignments committed while this transaction waited.
            await tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM voice_human_agent_profiles WHERE id = ${candidate.id} FOR UPDATE
            `;
            const profile = await tx.voiceHumanAgentProfile.findFirst({
              where: {
                id: candidate.id,
                businessId,
                active: true,
                presenceStatus: VoiceAgentPresenceStatus.available,
                lastHeartbeatAt: { gte: freshSince },
                staffUser: {
                  is: {
                    active: true,
                    user: {
                      is: softphoneEnabled ? {} : { phone: { not: null } },
                    },
                  },
                },
              },
              select: {
                id: true,
                staffUserId: true,
                maxConcurrentCalls: true,
                staffUser: {
                  select: {
                    user: { select: { name: true, phone: true } },
                  },
                },
              },
            });
            if (
              !profile ||
              (!profile.staffUser.user.phone && !softphoneEnabled)
            )
              continue;

            const activeAssignments = await tx.voiceHumanAgentAssignment.count({
              where: {
                businessId,
                profileId: profile.id,
                status: { in: ['offered', 'connected'] },
                OR: [
                  { status: 'connected' },
                  { expiresAt: { gt: now } },
                  { providerDispatchState: { in: ['requested', 'uncertain'] } },
                ],
              },
            });
            const activeOutboundAttempts =
              await tx.voiceOutboundDialAttempt.count({
                where: {
                  businessId,
                  agentProfileId: profile.id,
                  status: { in: ['agent_ringing', 'customer_ringing'] },
                },
              });
            const activeCallbackAttempts = await tx.voiceCallbackAttempt.count({
              where: {
                businessId,
                agentProfileId: profile.id,
                status: { in: ['agent_ringing', 'customer_ringing'] },
              },
            });
            if (
              activeAssignments +
                activeOutboundAttempts +
                activeCallbackAttempts >=
              profile.maxConcurrentCalls
            ) {
              continue;
            }

            const assignment = await tx.voiceHumanAgentAssignment.create({
              data: {
                businessId,
                callId,
                attemptNumber,
                profileId: profile.id,
                staffUserId: profile.staffUserId,
                status: 'offered',
                expiresAt: new Date(now.getTime() + 120_000),
              },
              select: { id: true },
            });

            return {
              assignmentId: assignment.id,
              callId,
              profileId: profile.id,
              staffUserId: profile.staffUserId,
              name: profile.staffUser.user.name,
              phone:
                profile.staffUser.user.phone ??
                `client:${voiceSoftphoneIdentity(businessId, profile.id)}`,
              attemptNumber,
            };
          }
          return null;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // A retry of the same live transfer must not create a second reservation.
        return null;
      }
      throw error;
    }
  }

  private isSoftphoneConfigured() {
    return Boolean(
      this.config?.get<string>('TWILIO_ACCOUNT_SID') &&
      this.config?.get<string>('TWILIO_AUTH_TOKEN') &&
      this.config?.get<string>('TWILIO_API_KEY_SID') &&
      this.config?.get<string>('TWILIO_API_KEY_SECRET') &&
      this.config?.get<string>('TWILIO_TWIML_APP_SID'),
    );
  }

  /** Prefer an exact business-entered skill tag for a topic classified from this call turn. */
  private hasTopicSkill(
    skillTags: Prisma.JsonValue,
    preferredTopic?: TopicKey | null,
  ): boolean {
    if (!preferredTopic || !Array.isArray(skillTags)) return false;
    const topicLabel = TOPICS[preferredTopic];
    const normalize = (value: string) =>
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const expected = new Set([
      normalize(preferredTopic),
      normalize(topicLabel),
    ]);
    return skillTags.some(
      (tag) => typeof tag === 'string' && expected.has(normalize(tag)),
    );
  }

  async observeDialStatus(
    callId: string,
    providerStatus: string,
    attemptNumber?: number,
    sequenceNumber?: number,
    pendingAction?: string | null,
  ) {
    const normalized = providerStatus.trim().toLowerCase();
    if (
      Number.isSafeInteger(sequenceNumber) &&
      sequenceNumber! >= 0 &&
      sequenceNumber! <= 2_147_483_647
    ) {
      const updateWhere = {
        callId,
        ...(attemptNumber ? { attemptNumber } : {}),
        status: { in: ['offered', 'connected'] },
        OR: [
          { providerStatusSequence: null },
          { providerStatusSequence: { lt: sequenceNumber } },
        ],
      };
      if (
        normalized === 'answered' ||
        normalized === 'in-progress' ||
        normalized === 'connected'
      ) {
        return this.prisma.voiceHumanAgentAssignment.updateMany({
          where: updateWhere,
          data: {
            status: 'connected',
            connected: true,
            providerStatus: normalized,
            providerStatusSequence: sequenceNumber,
            ...(pendingAction !== undefined ? { pendingAction } : {}),
            expiresAt: null,
          },
        });
      }
      if (
        ['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(
          normalized,
        )
      ) {
        return this.prisma.voiceHumanAgentAssignment.updateMany({
          where: updateWhere,
          data: {
            status: 'released',
            providerStatus: normalized,
            providerStatusSequence: sequenceNumber,
            ...(pendingAction !== undefined ? { pendingAction } : {}),
            connected:
              normalized === 'completed' ||
              normalized === 'answered' ||
              normalized === 'in-progress',
            releasedAt: new Date(),
            expiresAt: null,
          },
        });
      }
      return this.prisma.voiceHumanAgentAssignment.updateMany({
        where: updateWhere,
        data: {
          providerStatus: normalized,
          providerStatusSequence: sequenceNumber,
          ...(pendingAction !== undefined ? { pendingAction } : {}),
        },
      });
    }
    if (
      normalized === 'answered' ||
      normalized === 'in-progress' ||
      normalized === 'connected'
    ) {
      return this.prisma.voiceHumanAgentAssignment.updateMany({
        where: {
          callId,
          ...(attemptNumber ? { attemptNumber } : {}),
          status: 'offered',
        },
        data: {
          status: 'connected',
          connected: true,
          providerStatus: normalized,
          expiresAt: null,
          ...(pendingAction !== undefined ? { pendingAction } : {}),
        },
      });
    }

    if (
      ['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(
        normalized,
      )
    ) {
      return this.release(callId, normalized, attemptNumber, pendingAction);
    }
    return { count: 0 };
  }

  async recordConferenceParticipant(
    businessId: string,
    callId: string,
    attemptNumber: number,
    providerCallSid: string,
    conferenceSid: string,
  ) {
    return this.prisma.voiceHumanAgentAssignment.updateMany({
      where: {
        businessId,
        callId,
        attemptNumber,
        OR: [{ providerCallSid: null }, { providerCallSid }],
      },
      data: {
        providerCallSid,
        conferenceSid,
        providerDispatchState: 'confirmed',
      },
    });
  }

  async releaseExpiredOffers(businessId?: string, now = new Date()) {
    return this.prisma.voiceHumanAgentAssignment.updateMany({
      where: {
        ...(businessId ? { businessId } : {}),
        status: 'offered',
        expiresAt: { lte: now },
        OR: [
          { providerDispatchState: null },
          { providerDispatchState: { notIn: ['requested', 'uncertain'] } },
        ],
      },
      data: {
        status: 'released',
        providerStatus: 'reservation_timeout',
        releasedAt: now,
      },
    });
  }

  async release(
    callId: string,
    providerStatus: string,
    attemptNumber?: number,
    pendingAction?: string | null,
  ) {
    const normalized = providerStatus.trim().toLowerCase();
    return this.prisma.voiceHumanAgentAssignment.updateMany({
      where: {
        callId,
        ...(attemptNumber ? { attemptNumber } : {}),
        status: { in: ['offered', 'connected'] },
      },
      data: {
        status: 'released',
        providerStatus: normalized,
        connected:
          normalized === 'completed' ||
          normalized === 'answered' ||
          normalized === 'in-progress',
        releasedAt: new Date(),
        expiresAt: null,
        ...(pendingAction !== undefined ? { pendingAction } : {}),
      },
    });
  }
}
