import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { ConnectorRegistry } from './connector-registry';
import { TokenCipherService } from './token-cipher.service';
import { signPayload, verifyPayload } from './signed-token.util';
import { OAuthTokens } from './connector.interface';
import { IntegrationAuditService } from './integration-audit.service';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';

interface StatePayload {
  businessId: string;
  provider: string;
  /** Who started the connect flow — the public OAuth callback has no session to read it from. */
  actorUserId?: string;
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
    @Optional() private readonly audit?: IntegrationAuditService,
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
    params: Record<string, string> = {},
    actorUserId?: string,
  ): Promise<ConnectResult> {
    const connector = this.connectors.get(provider);
    const state = signPayload<StatePayload>(
      { businessId, provider, actorUserId },
      this.stateSecret(),
    );
    const url = connector.authUrl(state, params);

    if (!url) {
      // Non-OAuth provider (email, apple_business_connect, and — UPD-BE-073 — WooCommerce's
      // manual store-URL/consumer-key/consumer-secret entry) — nothing to redirect to, connect
      // directly. `params` (the connect request body) is forwarded as `rawQuery` so a connector
      // like WooCommerce's can read the credentials the merchant just typed in. Still exchanges
      // via `handleCallback()` and stores whatever real tokens it returns (e.g. Apple's
      // pre-provisioned server-to-server API key) — a fix for a real gap: this branch used to
      // connect without ever storing tokens, so `getTokens()` always came back `null` for a
      // non-OAuth provider and any real `pushListing()` call silently no-op'd even once a real
      // credential was configured.
      let tokens: OAuthTokens;
      try {
        tokens = await connector.handleCallback('', params);
      } catch (error) {
        // A credential the provider rejects (or one that is missing) is the merchant's to fix —
        // say so plainly instead of surfacing a generic 500.
        const reason = (error as Error).message;
        await this.audit?.record({
          businessId,
          key: provider,
          action: 'integration.connect_failed',
          actorUserId,
          after: { reason: reason.slice(0, 300) },
        });
        throw new AppException(
          'INTEGRATION_CONNECT_FAILED',
          `Could not connect ${provider}: ${reason}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      const meta = tokens.providerMeta;
      await this.tenantPrisma.client.integration.upsert({
        where: { businessId_provider: { businessId, provider } },
        create: {
          businessId,
          provider,
          status: IntegrationStatus.connected,
          connectedAt: new Date(),
          tokens: this.tokenCipher.encrypt(JSON.stringify(tokens)),
          ...(meta ? { meta } : {}),
        },
        update: {
          status: IntegrationStatus.connected,
          connectedAt: new Date(),
          tokens: this.tokenCipher.encrypt(JSON.stringify(tokens)),
          ...(meta ? { meta } : {}),
        },
      });
      await this.audit?.record({
        businessId,
        key: provider,
        action: 'integration.connected',
        actorUserId,
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
    rawQuery: Record<string, string> = {},
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
      const tokens = await connector.handleCallback(code, rawQuery);
      const meta = tokens.providerMeta;
      await this.tenantPrisma.client.integration.upsert({
        where: { businessId_provider: { businessId, provider } },
        create: {
          businessId,
          provider,
          status: IntegrationStatus.connected,
          connectedAt: new Date(),
          tokens: this.tokenCipher.encrypt(JSON.stringify(tokens)),
          ...(meta ? { meta } : {}),
        },
        update: {
          status: IntegrationStatus.connected,
          connectedAt: new Date(),
          tokens: this.tokenCipher.encrypt(JSON.stringify(tokens)),
          ...(meta ? { meta } : {}),
        },
      });
      await this.audit?.record({
        businessId,
        key: provider,
        action: 'integration.connected',
        actorUserId: payload.actorUserId,
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
      await this.audit?.record({
        businessId,
        key: provider,
        action: 'integration.connect_failed',
        actorUserId: payload.actorUserId,
        after: { reason: (error as Error).message.slice(0, 300) },
      });
      return { businessId, ok: false };
    }
  }

  async disconnect(
    businessId: string,
    provider: IntegrationProvider,
    actorUserId?: string,
  ): Promise<void> {
    const connector = this.connectors.get(provider);
    // Fetched before revoking so a real revoke call (QuickBooks, Xero) has a token to send —
    // most connectors ignore this argument entirely (their `disconnect()` is a documented no-op).
    const tokens = await this.getTokens(businessId, provider);
    await connector
      .disconnect(tokens ?? undefined)
      .catch((error: Error) =>
        this.logger.warn(
          `disconnect() failed for provider=${provider}: ${error.message}`,
        ),
      );
    await this.tenantPrisma.client.integration.updateMany({
      where: { businessId, provider },
      data: {
        status: IntegrationStatus.not_connected,
        tokens: null,
        connectedAt: null,
        pausedAt: null,
      },
    });
    await this.audit?.record({
      businessId,
      key: provider,
      action: 'integration.disconnected',
      actorUserId,
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
    const tokens = JSON.parse(
      this.tokenCipher.decrypt(row.tokens),
    ) as OAuthTokens;
    return this.refreshIfExpiring(businessId, provider, tokens);
  }

  /**
   * An access token that is about to expire (or already has) is renewed with its refresh token and
   * the renewed pair is stored, so a sync an hour after connecting doesn't die on a stale token.
   * When the provider refuses the refresh, the authorisation is genuinely gone — the connection is
   * moved to `needs_attention` so the owner is told to reconnect.
   */
  private async refreshIfExpiring(
    businessId: string,
    provider: IntegrationProvider,
    tokens: OAuthTokens,
  ): Promise<OAuthTokens> {
    if (!tokens.expiresAt || !tokens.refreshToken) return tokens;
    if (new Date(tokens.expiresAt).getTime() - Date.now() > 120_000)
      return tokens;
    try {
      const refreshed = await this.connectors
        .get(provider)
        .refreshToken(tokens);
      await this.tenantPrisma.client.integration.updateMany({
        where: { businessId, provider },
        data: { tokens: this.tokenCipher.encrypt(JSON.stringify(refreshed)) },
      });
      return refreshed;
    } catch (error) {
      this.logger.warn(
        `Token refresh failed for provider=${provider}: ${(error as Error).message}`,
      );
      await this.tenantPrisma.client.integration.updateMany({
        where: { businessId, provider, status: IntegrationStatus.connected },
        data: { status: IntegrationStatus.needs_attention },
      });
      return tokens;
    }
  }

  private stateSecret(): string {
    return this.config.get<string>('INTEGRATIONS_STATE_SECRET') ?? '';
  }
}
