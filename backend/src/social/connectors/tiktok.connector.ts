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

const API = 'https://open.tiktokapis.com/v2';

@Injectable()
export class TiktokConnector extends StandardOAuth2Connector {
  readonly platform = SocialPlatform.tiktok;
  protected readonly oauth: StandardOAuth2Config = {
    authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize',
    tokenUrl: `${API}/oauth/token/`,
    scope: 'user.info.basic,video.publish,video.list',
    clientIdEnvKey: 'TIKTOK_CLIENT_KEY',
    clientSecretEnvKey: 'TIKTOK_CLIENT_SECRET',
    redirectSegment: 'tiktok',
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
      data: { user: { open_id: string; display_name: string } };
    }>(`${API}/user/info/`, {
      params: { fields: 'open_id,display_name' },
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return {
      externalAccountId: response.data.data.user.open_id,
      externalAccountName: response.data.data.user.display_name,
    };
  }

  /** Real Content Posting API — initializes a video-publish job (async on TikTok's side). */
  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- matches the SocialConnector interface shape; TikTok's init call needs no extra context beyond the video URL.
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    const response = await axios.post<{ data: { publish_id: string } }>(
      `${API}/post/publish/video/init/`,
      {
        post_info: { title: post.caption },
        source_info: { source: 'PULL_FROM_URL', video_url: post.mediaUrls[0] },
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return { externalId: response.data.data.publish_id };
  }

  async fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]> {
    const videoId = meta.recentVideoId as string | undefined;
    if (!videoId) return [];
    const response = await axios.get<{
      data: {
        comments: {
          id: string;
          text: string;
          user: { display_name: string };
          create_time: number;
        }[];
      };
    }>(`${API}/video/comment/list/`, {
      params: { video_id: videoId },
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return response.data.data.comments.map((c) => ({
      externalId: c.id,
      kind: 'comment',
      authorName: c.user.display_name,
      text: c.text,
      postExternalId: videoId,
      receivedAt: new Date(c.create_time * 1000).toISOString(),
    }));
  }

  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    await axios.post(
      `${API}/video/comment/reply/`,
      { comment_id: target.externalId, text },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
  }

  async fetchInsights(
    tokens: SocialOAuthTokens,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- TikTok's own stats endpoint needs no extra context.
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    const response = await axios.get<{
      data: {
        user: {
          follower_count: number;
          likes_count: number;
          video_count: number;
        };
      };
    }>(`${API}/user/info/`, {
      params: { fields: 'follower_count,likes_count,video_count' },
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const user = response.data.data.user;
    return {
      followers: user.follower_count,
      reach: 0,
      impressions: 0,
      engagement: user.likes_count,
    };
  }
}
