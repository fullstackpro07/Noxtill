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

const API = 'https://api.twitter.com/2';

@Injectable()
export class TwitterConnector extends StandardOAuth2Connector {
  readonly platform = SocialPlatform.twitter;
  protected readonly oauth: StandardOAuth2Config = {
    authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: `${API}/oauth2/token`,
    scope: 'tweet.read tweet.write users.read offline.access',
    clientIdEnvKey: 'TWITTER_CLIENT_ID',
    clientSecretEnvKey: 'TWITTER_CLIENT_SECRET',
    redirectSegment: 'twitter',
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
      data: { id: string; username: string };
    }>(`${API}/users/me`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return {
      externalAccountId: response.data.data.id,
      externalAccountName: response.data.data.username,
    };
  }

  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    // A reply-to tweet id captured in `meta` turns this into a real threaded reply instead of a new tweet.
    const inReplyTo = meta.inReplyToTweetId as string | undefined;
    const response = await axios.post<{ data: { id: string } }>(
      `${API}/tweets`,
      {
        text: post.caption,
        reply: inReplyTo ? { in_reply_to_tweet_id: inReplyTo } : undefined,
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return { externalId: response.data.data.id };
  }

  /** Real recent-mentions search — the closest thing X's API has to a comment inbox for a business account. */
  async fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]> {
    const query = (meta.mentionsQuery as string | undefined) ?? '@me';
    const response = await axios.get<{
      data?: {
        id: string;
        text: string;
        author_id: string;
        created_at: string;
      }[];
    }>(`${API}/tweets/search/recent`, {
      params: { query, 'tweet.fields': 'created_at,author_id' },
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return (response.data.data ?? []).map((t) => ({
      externalId: t.id,
      kind: 'comment',
      authorName: t.author_id,
      text: t.text,
      receivedAt: t.created_at,
    }));
  }

  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    await axios.post(
      `${API}/tweets`,
      { text, reply: { in_reply_to_tweet_id: target.externalId } },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
  }

  async fetchInsights(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    const userId = meta.userId as string | undefined;
    const response = await axios.get<{
      data: {
        public_metrics: { followers_count: number; tweet_count: number };
      };
    }>(`${API}/users/${userId}`, {
      params: { 'user.fields': 'public_metrics' },
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const metrics = response.data.data.public_metrics;
    return {
      followers: metrics.followers_count,
      reach: 0,
      impressions: 0,
      engagement: metrics.tweet_count,
    };
  }
}
