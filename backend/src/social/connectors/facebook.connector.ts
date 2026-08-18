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

@Injectable()
export class FacebookConnector extends StandardOAuth2Connector {
  readonly platform = SocialPlatform.facebook;
  protected readonly oauth: StandardOAuth2Config = {
    authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: `${GRAPH}/oauth/access_token`,
    scope: 'pages_manage_posts,pages_read_engagement,pages_show_list',
    clientIdEnvKey: 'FACEBOOK_APP_ID',
    clientSecretEnvKey: 'FACEBOOK_APP_SECRET',
    redirectSegment: 'facebook',
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
    const response = await axios.get<{ id: string; name: string }>(
      `${GRAPH}/me`,
      {
        params: { access_token: tokens.accessToken, fields: 'id,name' },
      },
    );
    return {
      externalAccountId: response.data.id,
      externalAccountName: response.data.name,
    };
  }

  /** Real Page-feed publish (message + optional first media URL as a link attachment). */
  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    const pageId = (meta.pageId as string | undefined) ?? 'me';
    const response = await axios.post<{ id: string }>(
      `${GRAPH}/${pageId}/feed`,
      { message: post.caption, link: post.mediaUrls[0] },
      { params: { access_token: tokens.accessToken } },
    );
    return { externalId: response.data.id };
  }

  async fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]> {
    const pageId = (meta.pageId as string | undefined) ?? 'me';
    const response = await axios.get<{
      data: {
        id: string;
        message?: string;
        from?: { name: string };
        created_time: string;
      }[];
    }>(`${GRAPH}/${pageId}/comments`, {
      params: { access_token: tokens.accessToken },
    });
    return response.data.data.map((c) => ({
      externalId: c.id,
      kind: 'comment',
      authorName: c.from?.name,
      text: c.message ?? '',
      receivedAt: c.created_time,
    }));
  }

  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    await axios.post(
      `${GRAPH}/${target.externalId}/comments`,
      { message: text },
      { params: { access_token: tokens.accessToken } },
    );
  }

  async fetchInsights(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    const pageId = (meta.pageId as string | undefined) ?? 'me';
    const response = await axios.get<{
      data: { name: string; values: { value: number }[] }[];
    }>(`${GRAPH}/${pageId}/insights`, {
      params: {
        access_token: tokens.accessToken,
        metric:
          'page_fans,page_impressions,page_engaged_users,page_post_engagements',
      },
    });
    const byName = (name: string): number =>
      response.data.data.find((m) => m.name === name)?.values?.[0]?.value ?? 0;
    return {
      followers: byName('page_fans'),
      impressions: byName('page_impressions'),
      engagement: byName('page_engaged_users'),
      reach: byName('page_post_engagements'),
    };
  }
}
