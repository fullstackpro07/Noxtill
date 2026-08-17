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

const GRAPH = 'https://graph.facebook.com/v19.0';

/** Instagram Business accounts are managed through the same Meta Graph API as Facebook Pages. */
@Injectable()
export class InstagramConnector extends StandardOAuth2Connector {
  readonly platform = SocialPlatform.instagram;
  protected readonly oauth: StandardOAuth2Config = {
    authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: `${GRAPH}/oauth/access_token`,
    scope: 'instagram_basic,instagram_content_publish,pages_show_list',
    clientIdEnvKey: 'FACEBOOK_APP_ID',
    clientSecretEnvKey: 'FACEBOOK_APP_SECRET',
    redirectSegment: 'instagram',
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
    const response = await axios.get<{ id: string; username: string }>(
      `${GRAPH}/me`,
      {
        params: { access_token: tokens.accessToken, fields: 'id,username' },
      },
    );
    return {
      externalAccountId: response.data.id,
      externalAccountName: response.data.username,
    };
  }

  /** Real two-step Content Publishing API: create a media container, then publish it. */
  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    const igUserId = meta.igUserId as string | undefined;
    if (!igUserId)
      throw new Error(
        'No Instagram Business account selected for this business',
      );

    const container = await axios.post<{ id: string }>(
      `${GRAPH}/${igUserId}/media`,
      { image_url: post.mediaUrls[0], caption: post.caption },
      { params: { access_token: tokens.accessToken } },
    );
    const published = await axios.post<{ id: string }>(
      `${GRAPH}/${igUserId}/media_publish`,
      { creation_id: container.data.id },
      { params: { access_token: tokens.accessToken } },
    );
    return { externalId: published.data.id };
  }

  async fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]> {
    const mediaId = meta.recentMediaId as string | undefined;
    if (!mediaId) return [];
    const response = await axios.get<{
      data: { id: string; text: string; username: string; timestamp: string }[];
    }>(`${GRAPH}/${mediaId}/comments`, {
      params: { access_token: tokens.accessToken },
    });
    return response.data.data.map((c) => ({
      externalId: c.id,
      kind: 'comment',
      authorName: c.username,
      text: c.text,
      postExternalId: mediaId,
      receivedAt: c.timestamp,
    }));
  }

  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    await axios.post(
      `${GRAPH}/${target.externalId}/replies`,
      { message: text },
      { params: { access_token: tokens.accessToken } },
    );
  }

  async fetchInsights(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    const igUserId = meta.igUserId as string | undefined;
    const response = await axios.get<{
      data: { name: string; values: { value: number }[] }[];
    }>(`${GRAPH}/${igUserId}/insights`, {
      params: {
        access_token: tokens.accessToken,
        metric: 'impressions,reach,profile_views,follower_count',
        period: 'day',
      },
    });
    const byName = (name: string): number =>
      response.data.data.find((m) => m.name === name)?.values?.[0]?.value ?? 0;
    return {
      followers: byName('follower_count'),
      reach: byName('reach'),
      impressions: byName('impressions'),
      engagement: byName('profile_views'),
    };
  }
}
