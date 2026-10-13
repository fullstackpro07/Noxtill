import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CustomerStatus,
  Prisma,
  VoiceOutboundCampaignMemberStatus,
  VoiceOutboundCampaignStatus,
  VoicePolicyCallerType,
} from '@prisma/client';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { VoiceComplianceService } from './voice-compliance.service';
import {
  CreateVoiceOutboundCampaignDto,
  UpdateVoiceOutboundCampaignDto,
} from './dto/voice-outbound.dto';
import { VOICE_ERROR_CODES } from './voice.constants';

const OUTBOUND_PURPOSES = new Set(['service', 'callback', 'marketing']);
const OUTBOUND_CALLER_TYPES = new Set<VoicePolicyCallerType>([
  VoicePolicyCallerType.ai_voice,
  VoicePolicyCallerType.live_agent,
]);
const maskPhone = (phone: string) => `•••• ${phone.slice(-4)}`;
const OUTBOUND_CAMPAIGN_INCLUDE = {
  aiAgent: { select: { id: true, name: true, status: true } },
  humanAgentProfile: {
    include: { staffUser: { select: { user: { select: { name: true } } } } },
  },
  members: {
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          optedOut: true,
          consentMarketing: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.VoiceOutboundCampaignInclude;

type OutboundCampaignRecord = Prisma.VoiceOutboundCampaignGetPayload<{
  include: typeof OUTBOUND_CAMPAIGN_INCLUDE;
}>;

type CampaignConfiguration = Pick<
  CreateVoiceOutboundCampaignDto,
  | 'name'
  | 'purpose'
  | 'callerType'
  | 'countryCode'
  | 'timeZone'
  | 'openingScript'
  | 'aiAgentId'
  | 'humanAgentProfileId'
  | 'scheduledAt'
  | 'maxAttemptsPerContact'
  | 'retryCooldownHours'
>;

@Injectable()
export class VoiceOutboundCampaignService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly compliance: VoiceComplianceService,
    private readonly audit: AuditService,
  ) {}

  async list(businessId: string) {
    const campaigns =
      await this.tenantPrisma.client.voiceOutboundCampaign.findMany({
        where: { businessId },
        include: OUTBOUND_CAMPAIGN_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 100,
      });
    return campaigns.map((campaign) => this.presentCampaign(campaign));
  }

  async audience(businessId: string) {
    const customers = await this.tenantPrisma.client.customer.findMany({
      where: {
        businessId,
        status: CustomerStatus.active,
        phone: { not: '' },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        optedOut: true,
        consentMarketing: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    return customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: maskPhone(customer.phone),
      optedOut: customer.optedOut,
      consentMarketing: customer.consentMarketing,
    }));
  }

  async agents(businessId: string) {
    const [aiAgents, humanAgents] = await Promise.all([
      this.tenantPrisma.client.voiceAiAgent.findMany({
        where: {
          businessId,
          status: 'active',
          publishedVersionId: { not: null },
        },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.tenantPrisma.client.voiceHumanAgentProfile.findMany({
        where: { businessId, active: true, staffUser: { active: true } },
        include: {
          staffUser: { select: { user: { select: { name: true } } } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return {
      aiAgents,
      humanAgents: humanAgents.map((agent) => ({
        id: agent.id,
        name: agent.staffUser.user.name,
        presenceStatus: agent.presenceStatus,
      })),
    };
  }

  async create(
    businessId: string,
    actorUserId: string,
    dto: CreateVoiceOutboundCampaignDto,
  ) {
    const configuration = this.configurationFrom(dto);
    await this.validateConfiguration(businessId, configuration);
    await this.assertCustomersOwnedAndActive(businessId, dto.customerIds);

    const campaign =
      await this.tenantPrisma.client.voiceOutboundCampaign.create({
        data: {
          businessId,
          name: configuration.name.trim(),
          purpose: configuration.purpose,
          callerType: configuration.callerType,
          countryCode: configuration.countryCode.toUpperCase(),
          timeZone: configuration.timeZone.trim(),
          openingScript: configuration.openingScript.trim(),
          aiAgentId: configuration.aiAgentId ?? null,
          humanAgentProfileId: configuration.humanAgentProfileId ?? null,
          scheduledAt: this.scheduledAt(configuration.scheduledAt),
          maxAttemptsPerContact: configuration.maxAttemptsPerContact ?? 1,
          retryCooldownHours: configuration.retryCooldownHours ?? 24,
          createdByUserId: actorUserId,
          members: {
            create: dto.customerIds.map((customerId) => ({
              businessId,
              customerId,
            })),
          },
        },
        include: OUTBOUND_CAMPAIGN_INCLUDE,
      });
    await this.audit.log({
      entity: 'VoiceOutboundCampaign',
      entityId: campaign.id,
      action: 'voice.outbound_campaign.draft_created',
      after: {
        purpose: campaign.purpose,
        callerType: campaign.callerType,
        countryCode: campaign.countryCode,
        selectedContactCount: dto.customerIds.length,
        callsPlaced: false,
        actorUserId,
      },
    });
    return this.presentCampaign(campaign);
  }

  async updateDraft(
    businessId: string,
    actorUserId: string,
    campaignId: string,
    dto: UpdateVoiceOutboundCampaignDto,
  ) {
    const existing = await this.findCampaign(businessId, campaignId);
    if (existing.status !== VoiceOutboundCampaignStatus.draft) {
      throw new AppException(
        VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_NOT_EDITABLE,
        'Only a draft outbound campaign can be edited.',
        HttpStatus.CONFLICT,
      );
    }
    const configuration: CampaignConfiguration = {
      name: dto.name ?? existing.name,
      purpose: (dto.purpose ??
        existing.purpose) as CampaignConfiguration['purpose'],
      callerType: (dto.callerType ??
        existing.callerType) as CampaignConfiguration['callerType'],
      countryCode: dto.countryCode ?? existing.countryCode,
      timeZone: dto.timeZone ?? existing.timeZone,
      openingScript: dto.openingScript ?? existing.openingScript,
      aiAgentId:
        dto.aiAgentId !== undefined ? dto.aiAgentId : existing.aiAgentId,
      humanAgentProfileId:
        dto.humanAgentProfileId !== undefined
          ? dto.humanAgentProfileId
          : existing.humanAgentProfileId,
      scheduledAt:
        dto.scheduledAt !== undefined
          ? dto.scheduledAt
          : (existing.scheduledAt?.toISOString() ?? null),
      maxAttemptsPerContact:
        dto.maxAttemptsPerContact ?? existing.maxAttemptsPerContact,
      retryCooldownHours: dto.retryCooldownHours ?? existing.retryCooldownHours,
    };
    await this.validateConfiguration(businessId, configuration);
    const customerIds =
      dto.customerIds ?? existing.members.map((member) => member.customerId);
    await this.assertCustomersOwnedAndActive(businessId, customerIds);

    const updated = await this.tenantPrisma.client.$transaction(async (tx) => {
      if (dto.customerIds) {
        await tx.voiceOutboundCampaignMember.deleteMany({
          where: { businessId, campaignId },
        });
        await tx.voiceOutboundCampaignMember.createMany({
          data: customerIds.map((customerId) => ({
            businessId,
            campaignId,
            customerId,
          })),
        });
      }
      await tx.voiceOutboundCampaignMember.updateMany({
        where: { businessId, campaignId },
        data: {
          status: VoiceOutboundCampaignMemberStatus.selected,
          blockReasonCode: null,
          eligibilityDecisionId: null,
          eligibilityCheckedAt: null,
        },
      });
      return tx.voiceOutboundCampaign.update({
        where: { id: campaignId },
        data: {
          name: configuration.name.trim(),
          purpose: configuration.purpose,
          callerType: configuration.callerType,
          countryCode: configuration.countryCode.toUpperCase(),
          timeZone: configuration.timeZone.trim(),
          openingScript: configuration.openingScript.trim(),
          aiAgentId: configuration.aiAgentId ?? null,
          humanAgentProfileId: configuration.humanAgentProfileId ?? null,
          scheduledAt: this.scheduledAt(configuration.scheduledAt),
          maxAttemptsPerContact: configuration.maxAttemptsPerContact ?? 1,
          retryCooldownHours: configuration.retryCooldownHours ?? 24,
          eligibilityCheckedAt: null,
        },
        include: OUTBOUND_CAMPAIGN_INCLUDE,
      });
    });
    await this.audit.log({
      entity: 'VoiceOutboundCampaign',
      entityId: campaignId,
      action: 'voice.outbound_campaign.draft_updated',
      before: { selectedContactCount: existing.members.length },
      after: { selectedContactCount: customerIds.length, actorUserId },
    });
    return this.presentCampaign(updated);
  }

  async eligibilityPreview(
    businessId: string,
    actorUserId: string,
    campaignId: string,
  ) {
    const campaign = await this.findCampaign(businessId, campaignId);
    if (campaign.status !== VoiceOutboundCampaignStatus.draft) {
      throw new AppException(
        VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_NOT_EDITABLE,
        'Eligibility can only be previewed for a draft campaign.',
        HttpStatus.CONFLICT,
      );
    }
    const rows: {
      memberId: string;
      customerId: string;
      name: string;
      phone: string;
      eligible: boolean;
      reasonCode: string;
      decisionId: string | null;
    }[] = [];
    for (const member of campaign.members) {
      const rawPhone = member.customer.phone;
      const parsed = parsePhoneNumberFromString(rawPhone);
      let eligible = false;
      let reasonCode = 'phone_invalid';
      let decisionId: string | null = null;
      if (!parsed || !parsed.isValid() || parsed.number !== rawPhone) {
        reasonCode = 'phone_invalid';
      } else if (!parsed.country) {
        reasonCode = 'destination_country_unresolved';
      } else if (
        campaign.purpose === 'marketing' &&
        !member.customer.consentMarketing
      ) {
        reasonCode = 'marketing_consent_missing';
      } else if (parsed.country !== campaign.countryCode) {
        reasonCode = 'country_mismatch';
      } else {
        const decision = await this.compliance.checkEligibility(
          businessId,
          actorUserId,
          {
            phoneE164: parsed.number,
            countryCode: campaign.countryCode,
            purpose: campaign.purpose,
            callerType: campaign.callerType,
          },
        );
        eligible = decision.allowed;
        reasonCode = decision.reasonCode;
        decisionId = decision.id;
      }
      await this.tenantPrisma.client.voiceOutboundCampaignMember.update({
        where: { id: member.id },
        data: {
          status: eligible
            ? VoiceOutboundCampaignMemberStatus.eligible
            : VoiceOutboundCampaignMemberStatus.blocked,
          blockReasonCode: eligible ? null : reasonCode,
          eligibilityDecisionId: decisionId,
          eligibilityCheckedAt: new Date(),
        },
      });
      rows.push({
        memberId: member.id,
        customerId: member.customerId,
        name: member.customer.name,
        phone: maskPhone(rawPhone),
        eligible,
        reasonCode,
        decisionId,
      });
    }
    const checkedAt = new Date();
    await this.tenantPrisma.client.voiceOutboundCampaign.update({
      where: { id: campaignId },
      data: { eligibilityCheckedAt: checkedAt },
    });
    const eligibleCount = rows.filter((row) => row.eligible).length;
    const reasonCounts = rows.reduce<Record<string, number>>((counts, row) => {
      if (!row.eligible)
        counts[row.reasonCode] = (counts[row.reasonCode] ?? 0) + 1;
      return counts;
    }, {});
    await this.audit.log({
      entity: 'VoiceOutboundCampaign',
      entityId: campaignId,
      action: 'voice.outbound_campaign.eligibility_previewed',
      after: {
        selectedCount: rows.length,
        eligibleCount,
        blockedCount: rows.length - eligibleCount,
        blockedReasonCounts: reasonCounts,
        callsPlaced: false,
        actorUserId,
      },
    });
    return {
      campaignId,
      checkedAt: checkedAt.toISOString(),
      selectedCount: rows.length,
      eligibleCount,
      blockedCount: rows.length - eligibleCount,
      blockedReasonCounts: reasonCounts,
      members: rows,
      callsPlaced: false,
      message:
        'Preview only. No calls were placed. Eligibility must be checked again immediately before any future call attempt.',
      limitations: {
        externalDoNotCallRegistry: 'not_configured',
        callProviderExecution: 'not_configured',
        providerCostEstimate: 'not_available',
      },
    };
  }

  private presentCampaign(campaign: OutboundCampaignRecord) {
    const { members, aiAgent, humanAgentProfile, ...record } = campaign;
    return {
      ...record,
      aiAgent,
      humanAgent: humanAgentProfile
        ? {
            id: humanAgentProfile.id,
            name: humanAgentProfile.staffUser.user.name,
          }
        : null,
      selectedContactCount: members.length,
      eligibleCount: members.filter(
        (member) =>
          member.status === VoiceOutboundCampaignMemberStatus.eligible,
      ).length,
      blockedCount: members.filter(
        (member) => member.status === VoiceOutboundCampaignMemberStatus.blocked,
      ).length,
      members: members.map((member) => ({
        id: member.id,
        customerId: member.customerId,
        name: member.customer.name,
        phone: maskPhone(member.customer.phone),
        optedOut: member.customer.optedOut,
        status: member.status,
        blockReasonCode: member.blockReasonCode,
        eligibilityCheckedAt:
          member.eligibilityCheckedAt?.toISOString() ?? null,
      })),
      callsPlaced: false,
      callExecution: 'not_configured' as const,
    };
  }

  private configurationFrom(
    dto: CreateVoiceOutboundCampaignDto,
  ): CampaignConfiguration {
    return {
      name: dto.name,
      purpose: dto.purpose,
      callerType: dto.callerType,
      countryCode: dto.countryCode,
      timeZone: dto.timeZone,
      openingScript: dto.openingScript,
      aiAgentId: dto.aiAgentId,
      humanAgentProfileId: dto.humanAgentProfileId,
      scheduledAt: dto.scheduledAt,
      maxAttemptsPerContact: dto.maxAttemptsPerContact,
      retryCooldownHours: dto.retryCooldownHours,
    };
  }

  private async validateConfiguration(
    businessId: string,
    configuration: CampaignConfiguration,
  ) {
    if (!OUTBOUND_PURPOSES.has(configuration.purpose)) {
      throw this.invalid('Choose a supported outbound purpose.');
    }
    if (!OUTBOUND_CALLER_TYPES.has(configuration.callerType)) {
      throw this.invalid('Outbound prerecorded voice is not supported.');
    }
    if (
      (configuration.callerType === VoicePolicyCallerType.ai_voice &&
        (!configuration.aiAgentId || configuration.humanAgentProfileId)) ||
      (configuration.callerType === VoicePolicyCallerType.live_agent &&
        (configuration.aiAgentId || !configuration.humanAgentProfileId))
    ) {
      throw new AppException(
        VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_AGENT_REQUIRED,
        configuration.callerType === VoicePolicyCallerType.ai_voice
          ? 'Choose one published AI agent for this AI campaign.'
          : 'Choose one active human agent profile for this human campaign.',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: configuration.timeZone,
      }).format(new Date());
    } catch {
      throw this.invalid('Choose a valid IANA time zone.');
    }
    if (
      configuration.scheduledAt &&
      (!Number.isFinite(new Date(configuration.scheduledAt).getTime()) ||
        new Date(configuration.scheduledAt).getTime() <= Date.now())
    ) {
      throw this.invalid('Campaign schedule must be in the future.');
    }
    if (configuration.aiAgentId) {
      const agent = await this.tenantPrisma.client.voiceAiAgent.findFirst({
        where: {
          id: configuration.aiAgentId,
          businessId,
          status: 'active',
          publishedVersionId: { not: null },
        },
        select: { id: true },
      });
      if (!agent) {
        throw new AppException(
          VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_AGENT_NOT_FOUND,
          'Choose a published AI agent that is active in this business.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    if (configuration.humanAgentProfileId) {
      const agent =
        await this.tenantPrisma.client.voiceHumanAgentProfile.findFirst({
          where: {
            id: configuration.humanAgentProfileId,
            businessId,
            active: true,
            staffUser: { active: true },
          },
          select: { id: true },
        });
      if (!agent) {
        throw new AppException(
          VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_AGENT_NOT_FOUND,
          'Choose an active human agent profile in this business.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  private async assertCustomersOwnedAndActive(
    businessId: string,
    customerIds: string[],
  ) {
    const ids = [...new Set(customerIds)];
    if (
      ids.length !== customerIds.length ||
      ids.length < 1 ||
      ids.length > 200
    ) {
      throw this.invalid('Choose between 1 and 200 distinct customers.');
    }
    const customers = await this.tenantPrisma.client.customer.findMany({
      where: {
        businessId,
        id: { in: ids },
        status: CustomerStatus.active,
      },
      select: { id: true },
    });
    if (customers.length !== ids.length) {
      throw new AppException(
        VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_CONTACT_NOT_FOUND,
        'One or more selected customers are unavailable in this business.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async findCampaign(businessId: string, campaignId: string) {
    const campaign =
      await this.tenantPrisma.client.voiceOutboundCampaign.findFirst({
        where: { id: campaignId, businessId },
        include: OUTBOUND_CAMPAIGN_INCLUDE,
      });
    if (!campaign) {
      throw new AppException(
        VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_NOT_FOUND,
        'Outbound campaign was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return campaign;
  }

  private scheduledAt(value?: string | null) {
    return value ? new Date(value) : null;
  }

  private invalid(message: string) {
    return new AppException(
      'VOICE_OUTBOUND_CAMPAIGN_INVALID',
      message,
      HttpStatus.BAD_REQUEST,
    );
  }
}
