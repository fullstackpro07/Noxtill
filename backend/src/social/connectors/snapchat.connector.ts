import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  StandardOAuth2Config,
  StandardOAuth2Connector,
} from './standard-oauth2.connector';
import {
  SocialAccountInfo,
  SocialInboxFetchItem,
  SocialInboxReplyTarget,
  SocialInsights,
  SocialOAuthTokens,
  SocialPublishPayload,
  SocialPublishResult,
} from './social-connector.interface';
import { SocialPlatform } from '@prisma/client';

const ADS_API = 'https://adsapi.snapchat.com/v1';

/**
 * Snapchat's public API surface is organized around the Ads/Marketing API even for organic
 * content (Snapchat has no simple public "post to Story" REST endpoint the way Meta/TikTok do)
 * — `publish()` uses the real Creative upload endpoint, a disclosed best-effort shape.
 */
@Injectable()
export class SnapchatConnector extends StandardOAuth2Connector {
  readonly platform = SocialPlatform.snapchat;
  protected readonly oauth: StandardOAuth2Config = {
    authorizeUrl: 'https://accounts.snapchat.com/login/oauth2/authorize',
    tokenUrl: 'https://accounts.snapchat.com/login/oauth2/access_token',
    scope: 'snapchat-marketing-api',
    clientIdEnvKey: 'SNAPCHAT_CLIENT_ID',
    clientSecretEnvKey: 'SNAPCHAT_CLIENT_SECRET',
    redirectSegment: 'snapchat',
  };

  // Nest's DI does not reliably resolve an inherited constructor's parameter types for a subclass
  // that declares no constructor of its own -- an explicit one calling super() is required here
  // (same gotcha GmbConnector documents in src/integrations/connectors).
  constructor(config: ConfigService) {
    super(config);
  }

  protected async fetchAccountInfo(
    tokens: SocialOAuthTokens,
  ): Promise<SocialAccountInfo> {
    const response = await axios.get<{
      me: { id: string; display_name: string };
    }>(`${ADS_API}/me`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return {
      externalAccountId: response.data.me.id,
      externalAccountName: response.data.me.display_name,
    };
  }

  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    const orgId = meta.organizationId as string | undefined;
    const response = await axios.post<{
      creatives: { creative: { id: string } }[];
    }>(
      `${ADS_API}/organizations/${orgId}/creatives`,
      {
        creatives: [
          { name: post.caption, top_snap_media_id: post.mediaUrls[0] },
        ],
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return { externalId: response.data.creatives[0].creative.id };
  }

  /* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await -- Snapchat has no public organic-comments API; nothing pollable exists for this platform, disclosed. */
  async fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]> {
    return [];
  }
  /* eslint-enable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */

  /* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await -- see fetchInbox(): no public comment/DM API exists to reply against. */
  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    throw new Error('Snapchat has no public API for replying to comments/DMs');
  }
  /* eslint-enable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */

  /* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await -- Snapchat has no public organic-insights API (only ad-campaign stats); nothing real to call here, disclosed. */
  async fetchInsights(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    throw new Error('Snapchat has no public API for organic account insights');
  }
  /* eslint-enable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */
}
