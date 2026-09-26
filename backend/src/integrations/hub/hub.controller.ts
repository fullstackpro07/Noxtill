import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import { HubStateService } from './hub-state.service';
import { HubAdvisorService } from './hub-advisor.service';
import { HubConnectionService } from './hub-connection.service';
import { HubAccountingService } from './hub-accounting.service';
import type { AccountingTxStatus } from './hub-accounting.service';
import { HubEcommerceService } from './hub-ecommerce.service';
import { HubAutomationService } from './hub-automation.service';
import { HubLineageService } from './hub-lineage.service';
import {
  CreateIntegrationRequestDto,
  HubRequestsService,
} from './hub-requests.service';
import { HUB_CATEGORY_ORDER } from './hub.catalog';

class DismissFindingDto {
  @IsString()
  @MaxLength(191)
  findingKey!: string;
}

/**
 * Integrations hub read model + connection actions. Registered as its own controller under
 * `integrations/hub/*` — three or more path segments, so it never collides with the dynamic
 * `GET /integrations/:provider` connection-detail route.
 */
@Controller('integrations/hub')
export class HubController {
  constructor(
    private readonly state: HubStateService,
    private readonly advisor: HubAdvisorService,
    private readonly connection: HubConnectionService,
    private readonly accounting: HubAccountingService,
    private readonly ecommerce: HubEcommerceService,
    private readonly automation: HubAutomationService,
    private readonly lineage: HubLineageService,
    private readonly requests: HubRequestsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Everything the shell, Directory and Connections tabs need in one round trip. */
  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('overview')
  async overview(@CurrentUser() user: AuthenticatedUser) {
    const providers = await this.state.cards(user.businessId);
    const [findings, unresolved, failedPosts] = await Promise.all([
      this.advisor.findings(user.businessId, providers),
      this.prisma.ecommerceSyncConflict.count({
        where: { businessId: user.businessId, status: 'pending' },
      }),
      this.prisma.order.count({
        where: {
          businessId: user.businessId,
          status: 'completed',
          accountingSyncedAt: null,
          accountingSyncError: { not: null },
        },
      }),
    ]);
    return {
      providers,
      categories: HUB_CATEGORY_ORDER,
      health: this.state.health(providers),
      findings,
      tabCounts: {
        connections: providers.filter((p) => p.status === 'needs_attention')
          .length,
        accounting: failedPosts,
        ecommerce: unresolved,
      },
    };
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('connections/:key')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    return this.connection.detail(user.businessId, key);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post('connections/:key/pause')
  pause(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    return this.connection.pause(user.businessId, user.sub, key);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post('connections/:key/resume')
  resume(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    return this.connection.resume(user.businessId, user.sub, key);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post('connections/:key/sync')
  sync(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    return this.connection.syncNow(user.businessId, user.sub, key);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post('advisor/dismiss')
  dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DismissFindingDto,
  ) {
    return this.advisor.dismiss(user.businessId, user.sub, dto.findingKey);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post('requests')
  async request(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIntegrationRequestDto,
  ) {
    const account = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { email: true },
    });
    return this.requests.create(
      user.businessId,
      user.sub,
      account?.email ?? undefined,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('lineage')
  async map(@CurrentUser() user: AuthenticatedUser) {
    const cards = await this.state.cards(user.businessId);
    return { chains: this.lineage.chains(cards) };
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('accounting/overview')
  accountingOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.accounting.overview(user.businessId);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('accounting/transactions')
  accountingTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: AccountingTxStatus,
  ) {
    return this.accounting.transactions(user.businessId, status);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('ecommerce/overview')
  ecommerceOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.ecommerce.overview(user.businessId);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('ecommerce/items')
  ecommerceItems(@CurrentUser() user: AuthenticatedUser) {
    return this.ecommerce.items(user.businessId);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('automation/overview')
  automationOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.automation.overview(user.businessId);
  }
}
