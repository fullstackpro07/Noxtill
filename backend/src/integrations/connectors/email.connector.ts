import { Injectable } from '@nestjs/common';
import { Connector, OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

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

  // eslint-disable-next-line @typescript-eslint/require-await -- not an OAuth provider; no code exchange
  async handleCallback(): Promise<OAuthTokens> {
    return { accessToken: '' };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- shared Postmark account, nothing to refresh
  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    return tokens;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- enabling the channel is the whole "sync"
  async sync(): Promise<unknown> {
    return { status: 'ok' };
  }

  async disconnect(): Promise<void> {
    // Nothing external to revoke — the shared platform Postmark account isn't per-business.
  }
}
