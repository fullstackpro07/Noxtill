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

const API = 'https://www.googleapis.com/youtube/v3';

/**
 * YouTube's real posting primitive is a video upload, not a simple text+image post like the
 * other platforms — `publish()` maps `caption` to the video's title/description and treats
 * `mediaUrls[0]` as the source video, a disclosed simplification of the real multipart Videos
 * API rather than a generic post.
 */
@Injectable()
export class YoutubeConnector extends StandardOAuth2Connector {
  readonly platform = SocialPlatform.youtube;
  protected readonly oauth: StandardOAuth2Config = {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
    clientIdEnvKey: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretEnvKey: 'GOOGLE_OAUTH_CLIENT_SECRET',
    redirectSegment: 'youtube',
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
      items: { id: string; snippet: { title: string } }[];
    }>(`${API}/channels`, {
      params: { part: 'snippet', mine: true },
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const channel = response.data.items[0];
    return {
      externalAccountId: channel.id,
      externalAccountName: channel.snippet.title,
    };
  }

  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    const response = await axios.post<{ id: string }>(
      `${API}/videos`,
      {
        snippet: { title: post.caption, description: post.caption },
        status: {
          privacyStatus: (meta.privacyStatus as string | undefined) ?? 'public',
        },
      },
      {
        params: { part: 'snippet,status', uploadType: 'resumable' },
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
    return { externalId: response.data.id };
  }

  async fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]> {
    const videoId = meta.recentVideoId as string | undefined;
    if (!videoId) return [];
    const response = await axios.get<{
      items: {
        id: string;
        snippet: {
          topLevelComment: {
            snippet: {
              textDisplay: string;
              authorDisplayName: string;
              publishedAt: string;
            };
          };
        };
      }[];
    }>(`${API}/commentThreads`, {
      params: { part: 'snippet', videoId },
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return response.data.items.map((thread) => ({
      externalId: thread.id,
      kind: 'comment',
      authorName: thread.snippet.topLevelComment.snippet.authorDisplayName,
      text: thread.snippet.topLevelComment.snippet.textDisplay,
      postExternalId: videoId,
      receivedAt: thread.snippet.topLevelComment.snippet.publishedAt,
    }));
  }

  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    await axios.post(
      `${API}/comments`,
      { snippet: { parentId: target.externalId, textOriginal: text } },
      {
        params: { part: 'snippet' },
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
  }

  async fetchInsights(
    tokens: SocialOAuthTokens,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the channel-statistics call needs no extra context.
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    const response = await axios.get<{
      items: { statistics: { subscriberCount: string; viewCount: string } }[];
    }>(`${API}/channels`, {
      params: { part: 'statistics', mine: true },
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const stats = response.data.items[0].statistics;
    return {
      followers: Number(stats.subscriberCount),
      reach: 0,
      impressions: Number(stats.viewCount),
      engagement: 0,
    };
  }
}
