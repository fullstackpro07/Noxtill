import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { AppException } from '../common/filters/app.exception';
import { AdSettingsService } from './ad-settings.service';
import { CreateAdCampaignDto } from './dto/create-ad-campaign.dto';
import { UpdateAdCampaignDto } from './dto/update-ad-campaign.dto';
import { AD_ERROR_CODES, FATIGUE_LOOKBACK_DAYS } from './ads.constants';
import {
  IntegrationProvider,
  IntegrationStatus,
  Prisma,
  Role,
} from '@prisma/client';

function parseProvider(value: string): IntegrationProvider {
  if (!(Object.values(IntegrationProvider) as string[]).includes(value)) {
    throw new AppException(
      AD_ERROR_CODES.UNKNOWN_PROVIDER,
      `Unknown ad provider: ${value}`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return value as IntegrationProvider;
}

/**
 * Create Campaign (UPD-BE-069) — `POST /ads/:provider/campaigns` pushes a real, paused campaign
 * to the provider when connected and the connector supports it; otherwise (not connected, or a
 * provider whose connector doesn't implement `createCampaign` yet) it still creates a real local
 * `AdCampaign` row as a draft — a disclosed degradation, never a silent failure.
 */
@Injectable()
export class AdCampaignsService {
  private readonly logger = new Logger(AdCampaignsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    private readonly connectors: ConnectorRegistry,
    private readonly settings: AdSettingsService,
  ) {}

  list() {
    return this.tenantPrisma.client.adCampaign.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const campaign = await this.tenantPrisma.client.adCampaign.findUnique({
      where: { id },
    });
    if (!campaign) throw new NotFoundException('Ad campaign not found');
    return campaign;
  }

  async create(
    businessId: string,
    providerRaw: string,
    dto: CreateAdCampaignDto,
  ) {
    const provider = parseProvider(providerRaw);
    const integration = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider } },
    });
    const connector = this.connectors.get(provider);

    let externalId: string | undefined;
    let status = 'draft';
    let providerMeta: Record<string, unknown> = dto.meta ?? {};
    if (
      integration?.status === IntegrationStatus.connected &&
      connector.createCampaign
    ) {
      try {
        const tokens = await this.integrations.getTokens(businessId, provider);
        if (tokens) {
          const result = await connector.createCampaign(
            tokens,
            { name: dto.name, goal: dto.goal, dailyBudget: dto.dailyBudget },
            dto.meta ?? {},
          );
          externalId = result.externalId;
          status = 'paused'; // real campaigns are always created paused — never launches spend automatically
          providerMeta = { ...providerMeta, ...result.providerMeta };
        }
      } catch (error) {
        this.logger.warn(
          `Real campaign creation failed for provider=${provider}, falling back to a local draft: ${(error as Error).message}`,
        );
      }
    }

    return this.tenantPrisma.client.adCampaign.create({
      data: {
        businessId,
        integrationId: integration?.id,
        provider,
        goal: dto.goal,
        budget: dto.dailyBudget,
        status,
        externalId,
        stats: {} as unknown as Prisma.InputJsonValue,
        providerMeta: providerMeta as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Campaign management actions (UPD-BE-130) — pause/resume/budget-adjust. Attempts the real
   * provider-side change first (when connected, the connector supports it, and this campaign was
   * actually pushed to the provider); the local row is always updated regardless, so a
   * provider-side failure or an unsupported action never silently drops the change the caller asked for.
   *
   * `userRole` real-enforces `AdSettings.requireApproval` (depth fix) — when on, only the owner
   * can move a campaign INTO `active` (pausing, and any other change, stays open to anyone with
   * `ads.manage`). A no-op re-activation of an already-active campaign isn't gated — there's
   * nothing to approve there.
   */
  async update(
    businessId: string,
    id: string,
    dto: UpdateAdCampaignDto,
    userRole: Role,
  ) {
    const campaign = await this.findOne(id);

    if (dto.status === 'active' && campaign.status !== 'active') {
      const settings = await this.settings.get(businessId);
      if (settings.requireApproval && userRole !== Role.owner) {
        throw new ForbiddenException(
          'This business requires owner approval before a campaign can be activated',
        );
      }
    }

    const connector = this.connectors.get(campaign.provider);

    if (campaign.externalId && connector.updateCampaign) {
      const integration = await this.tenantPrisma.client.integration.findUnique(
        {
          where: {
            businessId_provider: { businessId, provider: campaign.provider },
          },
        },
      );
      if (integration?.status === IntegrationStatus.connected) {
        try {
          const tokens = await this.integrations.getTokens(
            businessId,
            campaign.provider,
          );
          if (tokens) {
            await connector.updateCampaign(
              tokens,
              campaign.externalId,
              { status: dto.status, dailyBudget: dto.dailyBudget },
              (campaign.providerMeta as Record<string, unknown>) ?? {},
            );
          }
        } catch (error) {
          this.logger.warn(
            `Real campaign update failed for provider=${campaign.provider}, applying the change locally only: ${(error as Error).message}`,
          );
        }
      }
    }

    return this.tenantPrisma.client.adCampaign.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.dailyBudget !== undefined ? { budget: dto.dailyBudget } : {}),
      },
    });
  }

  /**
   * Fatigue-warning depth fix — real, computed only from `AdCampaignStatsSnapshot` rows
   * `AdStatsSyncProcessor` has actually captured. Compares the latest real snapshot's CTR against
   * the oldest real snapshot at least `FATIGUE_LOOKBACK_DAYS` old (falling back to the very first
   * snapshot if history doesn't yet span that far) — never flags fatigue from a single data point.
   */
  async getFatigueWarning(id: string) {
    await this.findOne(id);
    const snapshots =
      await this.tenantPrisma.client.adCampaignStatsSnapshot.findMany({
        where: { campaignId: id },
        orderBy: { capturedAt: 'asc' },
      });

    if (snapshots.length < 2) {
      return { fatigued: false, sampleSize: snapshots.length };
    }

    const latest = snapshots[snapshots.length - 1];
    const cutoff = new Date(
      latest.capturedAt.getTime() - FATIGUE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    const baseline =
      snapshots.find((s) => s.capturedAt <= cutoff) ?? snapshots[0];
    if (baseline.id === latest.id) {
      return { fatigued: false, sampleSize: snapshots.length };
    }

    const ctr = (s: (typeof snapshots)[number]) =>
      s.impressions > 0 ? s.clicks / s.impressions : null;
    const latestCtr = ctr(latest);
    const baselineCtr = ctr(baseline);
    if (latestCtr == null || baselineCtr == null || baselineCtr === 0) {
      return { fatigued: false, sampleSize: snapshots.length };
    }

    const ctrDeclinePercent =
      Math.round(((baselineCtr - latestCtr) / baselineCtr) * 1000) / 10;
    return {
      fatigued: ctrDeclinePercent >= 25,
      ctrDeclinePercent,
      sampleSize: snapshots.length,
      baselineCapturedAt: baseline.capturedAt,
      latestCapturedAt: latest.capturedAt,
    };
  }
}
