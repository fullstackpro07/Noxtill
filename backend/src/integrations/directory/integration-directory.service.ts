import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { IntegrationsService } from '../integrations.service';
import { ConnectorRegistry } from '../connector-registry';
import { SocialAccountsService } from '../../social/social-accounts.service';
import { AD_PROVIDERS } from '../../ads/ads.constants';
import { ACCOUNTING_PROVIDERS } from '../accounting/accounting.constants';
import { ECOMMERCE_PROVIDERS } from '../ecommerce/ecommerce.constants';
import { AUTOMATION_PROVIDERS } from '../automation/automation.constants';
import { IntegrationStatus } from '@prisma/client';

export type IntegrationCategory =
  | 'ads'
  | 'directories'
  | 'social'
  | 'accounting'
  | 'ecommerce'
  | 'automation'
  | 'other';

export interface IntegrationDirectoryRow {
  provider: string;
  category: IntegrationCategory;
  status: string;
  updatedAt: Date | null;
}

/**
 * Integration Directory (UPD-BE-075) — one real listing across every category this codebase
 * actually has a connector or subscription mechanism for: Ads (UPD-BE-069/M20), Directories
 * (UPD-BE-041), Social (UPD-BE-045), Accounting (UPD-BE-072), E-commerce (UPD-BE-073), Automation
 * Platforms (UPD-BE-074), plus Email/Merchant Center under `other`. Payments and Developer & API
 * are deliberately excluded — Payments already has its own dedicated Billing settings screen (not
 * a connectable third-party integration in this codebase's sense), and Developer & API
 * (UPD-BE-081) doesn't exist yet — a disclosed scope boundary, not an oversight.
 */
@Injectable()
export class IntegrationDirectoryService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    private readonly connectors: ConnectorRegistry,
    private readonly socialAccounts: SocialAccountsService,
  ) {}

  async list(businessId: string): Promise<IntegrationDirectoryRow[]> {
    const directoryProviders = new Set(this.connectors.directoryProviders());
    const oauthRows = await this.integrations.list(businessId);
    const categorizedOAuthRows: IntegrationDirectoryRow[] = oauthRows.map(
      (row) => ({
        provider: row.provider,
        category: this.categorize(row.provider, directoryProviders),
        status: row.status,
        updatedAt: row.updatedAt,
      }),
    );

    const socialRows: IntegrationDirectoryRow[] = (
      await this.socialAccounts.list(businessId)
    ).map((row) => ({
      provider: row.platform,
      category: 'social',
      status: row.status,
      updatedAt: row.updatedAt,
    }));

    const activeAutomationSubs =
      await this.tenantPrisma.client.outboundWebhook.findMany({
        where: {
          businessId,
          provider: { in: AUTOMATION_PROVIDERS },
          active: true,
        },
        select: { provider: true },
      });
    const connectedAutomationProviders = new Set(
      activeAutomationSubs.map((s) => s.provider),
    );
    const automationRows: IntegrationDirectoryRow[] = AUTOMATION_PROVIDERS.map(
      (provider) => ({
        provider,
        category: 'automation',
        status: connectedAutomationProviders.has(provider)
          ? IntegrationStatus.connected
          : IntegrationStatus.not_connected,
        updatedAt: null,
      }),
    );

    return [...categorizedOAuthRows, ...socialRows, ...automationRows];
  }

  private categorize(
    provider: string,
    directoryProviders: Set<string>,
  ): IntegrationCategory {
    if ((AD_PROVIDERS as string[]).includes(provider)) return 'ads';
    if (directoryProviders.has(provider)) return 'directories';
    if ((ACCOUNTING_PROVIDERS as string[]).includes(provider))
      return 'accounting';
    if ((ECOMMERCE_PROVIDERS as string[]).includes(provider))
      return 'ecommerce';
    return 'other';
  }
}
