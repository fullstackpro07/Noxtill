import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SocialConnectorRegistry } from './connectors/social-connector-registry';
import { TokenCipherService } from '../integrations/token-cipher.service';
import { signPayload, verifyPayload } from '../integrations/signed-token.util';
import { SocialOAuthTokens } from './connectors/social-connector.interface';
import { SOCIAL_ERROR_CODES } from './social.constants';
import { SocialAccountStatus, SocialPlatform } from '../../generated/prisma';

interface StatePayload {
  businessId: string;
  platform: string;
}

export interface SocialConnectResult {
  authUrl?: string;
  requiresToken?: true;
}

/**
 * Connected Accounts (UPD-BE-045) — deliberately parallel to `IntegrationsService`, not built on
 * top of it (see `SocialConnector`'s doc comment). `connectWithToken()` is the fix for a real gap
 * found in `IntegrationsService.connect()`'s original non-OAuth branch (UPD-BE-041 gap-fix): it
 * never accepted a per-business credential, only ever a shared platform-wide env var. Here, the 4
 * token-based platforms (telegram/discord/wechat/line) explicitly return `requiresToken: true`
 * from `connect()` rather than silently connecting with nothing, and the caller must submit a
 * real credential via `connectWithToken()`, which is verified with one real API call before
 * anything is stored.
 */
@Injectable()
export class SocialAccountsService {
  private readonly logger = new Logger(SocialAccountsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly connectors: SocialConnectorRegistry,
    private readonly tokenCipher: TokenCipherService,
    private readonly config: ConfigService,
  ) {}

  async list(businessId: string) {
    const rows = await this.tenantPrisma.client.socialAccount.findMany({
      where: { businessId },
    });
    const byPlatform = new Map(rows.map((r) => [r.platform, r]));

    return this.connectors.all().map((platform) => {
      const row = byPlatform.get(platform);
      return {
        platform,
        status: row?.status ?? SocialAccountStatus.not_connected,
        externalAccountName: row?.externalAccountName ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  connect(businessId: string, platform: SocialPlatform): SocialConnectResult {
    const connector = this.connectors.get(platform);
    const state = signPayload<StatePayload>(
      { businessId, platform },
      this.stateSecret(),
    );
    const url = connector.authUrl(state);
    return url ? { authUrl: url } : { requiresToken: true };
  }

  async connectWithToken(
    businessId: string,
    platform: SocialPlatform,
    token: string,
  ): Promise<{ connected: true }> {
    const connector = this.connectors.get(platform);
    if (connector.authUrl('probe') !== null) {
      throw new AppException(
        SOCIAL_ERROR_CODES.NOT_TOKEN_BASED,
        `${platform} uses OAuth — call connect() and complete the redirect instead`,
        HttpStatus.BAD_REQUEST,
      );
    }

    let result: SocialOAuthTokens & {
      externalAccountId: string;
      externalAccountName?: string;
    };
    try {
      result = await connector.handleCallback(token);
    } catch (error) {
      throw new AppException(
        SOCIAL_ERROR_CODES.INVALID_CREDENTIAL,
        `Could not verify this ${platform} credential: ${(error as Error).message}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.tenantPrisma.client.socialAccount.upsert({
      where: { businessId_platform: { businessId, platform } },
      create: {
        businessId,
        platform,
        status: SocialAccountStatus.connected,
        tokens: this.tokenCipher.encrypt(JSON.stringify(result)),
        externalAccountId: result.externalAccountId,
        externalAccountName: result.externalAccountName,
      },
      update: {
        status: SocialAccountStatus.connected,
        tokens: this.tokenCipher.encrypt(JSON.stringify(result)),
        externalAccountId: result.externalAccountId,
        externalAccountName: result.externalAccountName,
      },
    });
    return { connected: true };
  }

  async handleCallback(
    platform: SocialPlatform,
    code: string,
    state: string,
  ): Promise<{ businessId: string; ok: boolean }> {
    const payload = verifyPayload<StatePayload>(state, this.stateSecret());
    if (!payload || payload.platform !== platform) {
      throw new AppException(
        SOCIAL_ERROR_CODES.INVALID_OAUTH_STATE,
        'This connection request could not be verified — please try connecting again.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { businessId } = payload;
    const connector = this.connectors.get(platform);

    try {
      const result = await connector.handleCallback(code);
      await this.tenantPrisma.client.socialAccount.upsert({
        where: { businessId_platform: { businessId, platform } },
        create: {
          businessId,
          platform,
          status: SocialAccountStatus.connected,
          tokens: this.tokenCipher.encrypt(JSON.stringify(result)),
          externalAccountId: result.externalAccountId,
          externalAccountName: result.externalAccountName,
        },
        update: {
          status: SocialAccountStatus.connected,
          tokens: this.tokenCipher.encrypt(JSON.stringify(result)),
          externalAccountId: result.externalAccountId,
          externalAccountName: result.externalAccountName,
        },
      });
      return { businessId, ok: true };
    } catch (error) {
      this.logger.warn(
        `OAuth callback failed for platform=${platform}: ${(error as Error).message}`,
      );
      await this.tenantPrisma.client.socialAccount.upsert({
        where: { businessId_platform: { businessId, platform } },
        create: {
          businessId,
          platform,
          status: SocialAccountStatus.needs_attention,
        },
        update: { status: SocialAccountStatus.needs_attention },
      });
      return { businessId, ok: false };
    }
  }

  async disconnect(
    businessId: string,
    platform: SocialPlatform,
  ): Promise<void> {
    const connector = this.connectors.get(platform);
    await connector
      .disconnect()
      .catch((error: Error) =>
        this.logger.warn(
          `disconnect() failed for platform=${platform}: ${error.message}`,
        ),
      );
    await this.tenantPrisma.client.socialAccount.updateMany({
      where: { businessId, platform },
      data: { status: SocialAccountStatus.not_connected, tokens: null },
    });
  }

  async getTokens(
    businessId: string,
    platform: SocialPlatform,
  ): Promise<SocialOAuthTokens | null> {
    const row = await this.tenantPrisma.client.socialAccount.findUnique({
      where: { businessId_platform: { businessId, platform } },
    });
    if (!row?.tokens) return null;
    return JSON.parse(
      this.tokenCipher.decrypt(row.tokens),
    ) as SocialOAuthTokens;
  }

  async getAccount(businessId: string, platform: SocialPlatform) {
    return this.tenantPrisma.client.socialAccount.findUnique({
      where: { businessId_platform: { businessId, platform } },
    });
  }

  private stateSecret(): string {
    return this.config.get<string>('INTEGRATIONS_STATE_SECRET') ?? '';
  }
}
