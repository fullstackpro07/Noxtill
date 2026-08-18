import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { ConnectorRegistry } from './connector-registry';
import { TokenCipherService } from './token-cipher.service';
import { signPayload, verifyPayload } from './signed-token.util';
import { OAuthTokens } from './connector.interface';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';

interface StatePayload {
  businessId: string;
  provider: string;
}

export interface ConnectResult {
  authUrl?: string;
  connected?: true;
}

/**
 * Connector framework (BE-082). `state` is HMAC-signed (not just a random opaque value) because
 * the callback route is necessarily public (the provider redirects the browser there with no
 * JWT) — signing lets the callback trust the embedded businessId without a DB round-trip or
 * requiring the caller to still be authenticated at redirect time.
 */
@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly connectors: ConnectorRegistry,
    private readonly tokenCipher: TokenCipherService,
    private readonly config: ConfigService,
  ) {}

  async list(businessId: string) {
    const rows = await this.tenantPrisma.client.integration.findMany({
      where: { businessId },
    });
    const byProvider = new Map(rows.map((r) => [r.provider, r]));

    return this.connectors.all().map((provider) => {
      const row = byProvider.get(provider);
      return {
        provider,
        status: row?.status ?? IntegrationStatus.not_connected,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  async connect(
    businessId: string,
    provider: IntegrationProvider,
  ): Promise<ConnectResult> {
    const connector = this.connectors.get(provider);
    const state = signPayload<StatePayload>(
      { businessId, provider },
      this.stateSecret(),
    );
    const url = connector.authUrl(state);

    if (!url) {
      // Non-OAuth provider (email, apple_business_connect) — nothing to redirect to, connect
      // directly. Still exchanges via `handleCallback()` and stores whatever real tokens it
      // returns (e.g. Apple's pre-provisioned server-to-server API key) — a fix for a real gap:
      // this branch used to connect without ever storing tokens, so `getTokens()` always came
      // back `null` for a non-OAuth provider and any real `pushListing()` call silently
      // no-op'd even once a real credential was configured.
      const tokens = await connector.handleCallback('');
      await this.tenantPrisma.client.integration.upsert({
        where: { businessId_provider: { businessId, provider } },
        create: {
          businessId,
          provider,
          status: IntegrationStatus.connected,
          tokens: this.tokenCipher.encrypt(JSON.stringify(tokens)),
        },
        update: {
          status: IntegrationStatus.connected,
          tokens: this.tokenCipher.encrypt(JSON.stringify(tokens)),
        },
      });
      return { connected: true };
    }

    return { authUrl: url };
  }

  /** Verifies `state`, exchanges `code` for tokens, and stores them encrypted. Never throws to the caller — a failed exchange lands the integration in `needs_attention` instead. */
  async handleCallback(
    provider: IntegrationProvider,
    code: string,
    state: string,
  ): Promise<{ businessId: string; ok: boolean }> {
    const payload = verifyPayload<StatePayload>(state, this.stateSecret());
    if (!payload || payload.provider !== provider) {
      throw new AppException(
        'INVALID_OAUTH_STATE',
        'This connection request could not be verified — please try connecting again.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { businessId } = payload;
    const connector = this.connectors.get(provider);

    try {
      const tokens = await connector.handleCallback(code);
      await this.tenantPrisma.client.integration.upsert({
        where: { businessId_provider: { businessId, provider } },
        create: {
          businessId,
          provider,
          status: IntegrationStatus.connected,
          tokens: this.tokenCipher.encrypt(JSON.stringify(tokens)),
        },
        update: {
          status: IntegrationStatus.connected,
          tokens: this.tokenCipher.encrypt(JSON.stringify(tokens)),
        },
      });
      return { businessId, ok: true };
    } catch (error) {
      this.logger.warn(
        `OAuth callback failed for provider=${provider}: ${(error as Error).message}`,
      );
      await this.tenantPrisma.client.integration.upsert({
        where: { businessId_provider: { businessId, provider } },
        create: {
          businessId,
          provider,
          status: IntegrationStatus.needs_attention,
        },
        update: { status: IntegrationStatus.needs_attention },
      });
      return { businessId, ok: false };
    }
  }

  async disconnect(
    businessId: string,
    provider: IntegrationProvider,
  ): Promise<void> {
    const connector = this.connectors.get(provider);
    await connector
      .disconnect()
      .catch((error: Error) =>
        this.logger.warn(
          `disconnect() failed for provider=${provider}: ${error.message}`,
        ),
      );
    await this.tenantPrisma.client.integration.updateMany({
      where: { businessId, provider },
      data: { status: IntegrationStatus.not_connected, tokens: null },
    });
  }

  /** Decrypts a stored integration's tokens for use by a connector call (e.g. sync()). */
  async getTokens(
    businessId: string,
    provider: IntegrationProvider,
  ): Promise<OAuthTokens | null> {
    const row = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider } },
    });
    if (!row?.tokens) return null;
    return JSON.parse(this.tokenCipher.decrypt(row.tokens)) as OAuthTokens;
  }

  private stateSecret(): string {
    return this.config.get<string>('INTEGRATIONS_STATE_SECRET') ?? '';
  }
}
