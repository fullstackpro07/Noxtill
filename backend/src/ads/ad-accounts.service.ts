import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { AD_PROVIDERS } from './ads.constants';
import { IntegrationStatus } from '@prisma/client';

export interface AdAccountsRow {
  provider: string;
  connected: boolean;
  accounts?: unknown;
  error?: string;
}

/** Unified Ad Accounts (UPD-BE-069) — `GET /ads/accounts` across every connected ad platform. */
@Injectable()
export class AdAccountsService {
  private readonly logger = new Logger(AdAccountsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    private readonly connectors: ConnectorRegistry,
  ) {}

  async list(businessId: string): Promise<AdAccountsRow[]> {
    const integrationRows = await this.tenantPrisma.client.integration.findMany(
      { where: { provider: { in: AD_PROVIDERS } } },
    );
    const connectedProviders = new Set(
      integrationRows
        .filter((row) => row.status === IntegrationStatus.connected)
        .map((row) => row.provider),
    );

    return Promise.all(
      AD_PROVIDERS.map(async (provider) => {
        if (!connectedProviders.has(provider)) {
          return { provider, connected: false };
        }
        try {
          const tokens = await this.integrations.getTokens(
            businessId,
            provider,
          );
          if (!tokens) return { provider, connected: false };
          const accounts = await this.connectors.get(provider).sync(tokens);
          return { provider, connected: true, accounts };
        } catch (error) {
          this.logger.warn(
            `Ad account listing failed for provider=${provider}: ${(error as Error).message}`,
          );
          return {
            provider,
            connected: true,
            error: (error as Error).message,
          };
        }
      }),
    );
  }
}
