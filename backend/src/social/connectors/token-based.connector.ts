import {
  SocialAccountInfo,
  SocialConnector,
  SocialInboxReplyTarget,
  SocialOAuthTokens,
} from './social-connector.interface';
import { SocialPlatform } from '../../../generated/prisma';

/**
 * Base for the 4 token/bot-credential platforms (telegram, discord, wechat, line) — no
 * user-facing OAuth redirect exists for a business's own bot/channel credential, so `authUrl()`
 * returns `null` (the same signal `EmailConnector`/`AppleBusinessConnectConnector` use in
 * `src/integrations/`). Unlike those, each business submits its OWN credential (not a shared
 * platform-wide one) via `POST /social/:platform/connect-with-token`, which calls
 * `handleCallback(token)` — repurposing the `code` parameter as "the submitted credential",
 * verified with one real API call before being stored.
 */
export abstract class TokenBasedConnector implements SocialConnector {
  abstract readonly platform: SocialPlatform;

  authUrl(): null {
    return null;
  }

  async handleCallback(
    token: string,
  ): Promise<SocialOAuthTokens & SocialAccountInfo> {
    const accountInfo = await this.verifyToken(token);
    return { accessToken: token, ...accountInfo };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- long-lived credential, nothing to refresh
  async refreshToken(tokens: SocialOAuthTokens): Promise<SocialOAuthTokens> {
    return tokens;
  }

  async disconnect(): Promise<void> {}

  /** Calls a real, minimal API endpoint to prove the submitted credential is valid, returning the real account identity. */
  protected abstract verifyToken(token: string): Promise<SocialAccountInfo>;
  abstract publish(
    tokens: SocialOAuthTokens,
    post: { caption: string; mediaUrls: string[] },
    meta: Record<string, unknown>,
  ): ReturnType<SocialConnector['publish']>;
  abstract fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): ReturnType<SocialConnector['fetchInbox']>;
  abstract replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void>;
  abstract fetchInsights(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): ReturnType<SocialConnector['fetchInsights']>;
}
