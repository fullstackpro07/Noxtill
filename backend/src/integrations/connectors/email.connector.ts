import { Injectable } from '@nestjs/common';
import { Connector, OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '../../../generated/prisma';

/**
 * Email connector (BE-083) — not an OAuth provider at all. Postmark/SES have no consumer-facing
 * OAuth flow; marketing email is sent through the same shared, platform-wide Postmark account
 * already used for transactional sends (`messaging/channels/email.service.ts`). "Connecting" is
 * therefore just enabling the channel, which is why `authUrl` returns `null` — the one signal
 * `IntegrationsService.connect` uses to skip the OAuth redirect entirely.
 */
@Injectable()
export class EmailConnector implements Connector {
  readonly provider = IntegrationProvider.email;

  authUrl(): null {
    return null;
  }

  handleCallback(): Promise<OAuthTokens> {
    return Promise.resolve({ accessToken: '' });
  }

  refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    return Promise.resolve(tokens);
  }

  sync(): Promise<unknown> {
    return Promise.resolve({ status: 'ok' });
  }

  disconnect(): Promise<void> {
    // Nothing external to revoke — the shared platform Postmark account isn't per-business.
    return Promise.resolve();
  }
}
