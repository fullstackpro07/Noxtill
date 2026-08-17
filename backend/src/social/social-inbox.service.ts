import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SocialAccountsService } from './social-accounts.service';
import { SocialConnectorRegistry } from './connectors/social-connector-registry';
import { SocialInboxFetchItem } from './connectors/social-connector.interface';
import { SOCIAL_ERROR_CODES } from './social.constants';
import {
  SocialAccountStatus,
  SocialInboxStatus,
  SocialPlatform,
} from '@prisma/client';

/**
 * Social Inbox (UPD-BE-049). `ingest()` is called from `SocialWebhookProcessor` with no CLS-bound
 * tenant context (a background BullMQ consumer, same "raw PrismaService, explicit businessId"
 * convention as `TerminologyService`) — it resolves the owning business itself by looking up
 * `SocialAccount.externalAccountId`, since an inbound webhook carries no businessId at all.
 */
@Injectable()
export class SocialInboxService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly accounts: SocialAccountsService,
    private readonly connectors: SocialConnectorRegistry,
  ) {}

  list(businessId: string, status?: SocialInboxStatus) {
    return this.tenantPrisma.client.socialInboxItem.findMany({
      where: { businessId, ...(status ? { status } : {}) },
      orderBy: { receivedAt: 'desc' },
    });
  }

  /** Resolves the owning business via `(platform, externalAccountId)` and upserts idempotently by `(businessId, platform, externalId)`. */
  async ingest(
    platform: SocialPlatform,
    externalAccountId: string,
    item: SocialInboxFetchItem,
  ): Promise<void> {
    const account = await this.prisma.socialAccount.findFirst({
      where: {
        platform,
        externalAccountId,
        status: SocialAccountStatus.connected,
      },
    });
    if (!account) return; // no connected business owns this account — nothing to ingest against

    await this.prisma.socialInboxItem.upsert({
      where: {
        businessId_platform_externalId: {
          businessId: account.businessId,
          platform,
          externalId: item.externalId,
        },
      },
      create: {
        businessId: account.businessId,
        platform,
        externalId: item.externalId,
        kind: item.kind,
        authorName: item.authorName,
        text: item.text,
        postExternalId: item.postExternalId,
        receivedAt: new Date(item.receivedAt),
      },
      update: {},
    });
  }

  async reply(businessId: string, id: string, text: string) {
    const item = await this.find(businessId, id);

    const tokens = await this.accounts.getTokens(businessId, item.platform);
    if (!tokens) {
      throw new AppException(
        SOCIAL_ERROR_CODES.ACCOUNT_NOT_CONNECTED,
        `${item.platform} is not connected for this business`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const connector = this.connectors.get(item.platform);
    await connector.replyToInboxItem(
      tokens,
      {
        externalId: item.externalId,
        postExternalId: item.postExternalId ?? undefined,
      },
      text,
    );

    return this.tenantPrisma.client.socialInboxItem.update({
      where: { id },
      data: {
        status: SocialInboxStatus.replied,
        repliedText: text,
        repliedAt: new Date(),
      },
    });
  }

  async markRead(businessId: string, id: string) {
    await this.find(businessId, id);
    return this.tenantPrisma.client.socialInboxItem.update({
      where: { id },
      data: { status: SocialInboxStatus.read },
    });
  }

  private async find(businessId: string, id: string) {
    const item = await this.tenantPrisma.client.socialInboxItem.findUnique({
      where: { id },
    });
    if (!item || item.businessId !== businessId) {
      throw new NotFoundException('Inbox item not found');
    }
    return item;
  }
}
