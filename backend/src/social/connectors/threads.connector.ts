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

const API = 'https://graph.threads.net/v1.0';

@Injectable()
export class ThreadsConnector extends StandardOAuth2Connector {
  readonly platform = SocialPlatform.threads;
  protected readonly oauth: StandardOAuth2Config = {
    authorizeUrl: 'https://threads.net/oauth/authorize',
    tokenUrl: 'https://graph.threads.net/oauth/access_token',
    scope: 'threads_basic,threads_content_publish,threads_manage_replies',
    clientIdEnvKey: 'THREADS_APP_ID',
    clientSecretEnvKey: 'THREADS_APP_SECRET',
    redirectSegment: 'threads',
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
      `${API}/me`,
      {
        params: { fields: 'id,username', access_token: tokens.accessToken },
      },
    );
    return {
      externalAccountId: response.data.id,
      externalAccountName: response.data.username,
    };
  }

  /** Real two-step Threads Publishing API, same shape as Instagram's. */
  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    const userId = (meta.threadsUserId as string | undefined) ?? 'me';
    const container = await axios.post<{ id: string }>(
      `${API}/${userId}/threads`,
      {
        media_type: post.mediaUrls.length ? 'IMAGE' : 'TEXT',
        text: post.caption,
        image_url: post.mediaUrls[0],
        access_token: tokens.accessToken,
      },
    );
    const published = await axios.post<{ id: string }>(
      `${API}/${userId}/threads_publish`,
      {
        creation_id: container.data.id,
        access_token: tokens.accessToken,
      },
    );
    return { externalId: published.data.id };
  }

  async fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]> {
    const postId = meta.recentPostId as string | undefined;
    if (!postId) return [];
    const response = await axios.get<{
      data: { id: string; text: string; username: string; timestamp: string }[];
    }>(`${API}/${postId}/replies`, {
      params: { access_token: tokens.accessToken },
    });
    return response.data.data.map((r) => ({
      externalId: r.id,
      kind: 'comment',
      authorName: r.username,
      text: r.text,
      postExternalId: postId,
      receivedAt: r.timestamp,
    }));
  }

  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    await axios.post(`${API}/me/threads`, {
      text,
      reply_to_id: target.externalId,
      access_token: tokens.accessToken,
    });
  }

  async fetchInsights(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    const userId = (meta.threadsUserId as string | undefined) ?? 'me';
    const response = await axios.get<{
      data: { name: string; values: { value: number }[] }[];
    }>(`${API}/${userId}/threads_insights`, {
      params: {
        metric: 'views,likes,replies,followers_count',
        access_token: tokens.accessToken,
      },
    });
    const byName = (name: string): number =>
      response.data.data.find((m) => m.name === name)?.values?.[0]?.value ?? 0;
    return {
      followers: byName('followers_count'),
      reach: byName('views'),
      impressions: byName('views'),
      engagement: byName('likes') + byName('replies'),
    };
  }
}
