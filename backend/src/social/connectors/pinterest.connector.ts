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
import { SocialPlatform } from '../../../generated/prisma';

const API = 'https://api.pinterest.com/v5';

@Injectable()
export class PinterestConnector extends StandardOAuth2Connector {
  readonly platform = SocialPlatform.pinterest;
  protected readonly oauth: StandardOAuth2Config = {
    authorizeUrl: 'https://www.pinterest.com/oauth',
    tokenUrl: `${API}/oauth/token`,
    scope: 'boards:read,pins:read,pins:write',
    clientIdEnvKey: 'PINTEREST_APP_ID',
    clientSecretEnvKey: 'PINTEREST_APP_SECRET',
    redirectSegment: 'pinterest',
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
    const response = await axios.get<{ username: string }>(
      `${API}/user_account`,
      {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
    return {
      externalAccountId: response.data.username,
      externalAccountName: response.data.username,
    };
  }

  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    const boardId = meta.boardId as string | undefined;
    const response = await axios.post<{ id: string }>(
      `${API}/pins`,
      {
        board_id: boardId,
        description: post.caption,
        media_source: { source_type: 'image_url', url: post.mediaUrls[0] },
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return { externalId: response.data.id };
  }

  async fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]> {
    const pinId = meta.recentPinId as string | undefined;
    if (!pinId) return [];
    const response = await axios.get<{
      items: {
        id: string;
        text: string;
        author: { username: string };
        created_at: string;
      }[];
    }>(`${API}/pins/${pinId}/comments`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return response.data.items.map((c) => ({
      externalId: c.id,
      kind: 'comment',
      authorName: c.author.username,
      text: c.text,
      postExternalId: pinId,
      receivedAt: c.created_at,
    }));
  }

  /**
   * Pinterest's v5 API has no real "reply to a specific comment" endpoint — the closest real
   * primitive is posting a new top-level comment on the same pin, which is why this needs
   * `target.postExternalId` (the pin), not `target.externalId` (the comment being replied to).
   */
  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    const pinId = target.postExternalId ?? target.externalId;
    await axios.post(
      `${API}/pins/${pinId}/comments`,
      { text },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
  }

  async fetchInsights(
    tokens: SocialOAuthTokens,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the analytics call is scoped to the authenticated account, no extra context needed.
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    const response = await axios.get<{
      all: {
        daily_metrics: {
          data_status: string;
          metrics: {
            PIN_CLICK_RATE: number;
            IMPRESSION: number;
            ENGAGEMENT: number;
          };
        }[];
      };
    }>(`${API}/user_account/analytics`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const metrics = response.data.all.daily_metrics[0]?.metrics;
    return {
      followers: 0,
      reach: metrics?.PIN_CLICK_RATE ?? 0,
      impressions: metrics?.IMPRESSION ?? 0,
      engagement: metrics?.ENGAGEMENT ?? 0,
    };
  }
}
