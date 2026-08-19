import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { AppException } from '../common/filters/app.exception';
import { CreateAdCampaignDto } from './dto/create-ad-campaign.dto';
import { AD_ERROR_CODES } from './ads.constants';
import { IntegrationProvider, IntegrationStatus, Prisma } from '@prisma/client';

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
      },
    });
  }
}
