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

const API = 'https://oauth.reddit.com';

@Injectable()
export class RedditConnector extends StandardOAuth2Connector {
  readonly platform = SocialPlatform.reddit;
  protected readonly oauth: StandardOAuth2Config = {
    authorizeUrl: 'https://www.reddit.com/api/v1/authorize',
    tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    scope: 'identity,submit,read,privatemessages',
    clientIdEnvKey: 'REDDIT_CLIENT_ID',
    clientSecretEnvKey: 'REDDIT_CLIENT_SECRET',
    redirectSegment: 'reddit',
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
      `${API}/api/v1/me`,
      {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
    return {
      externalAccountId: response.data.id,
      externalAccountName: response.data.name,
    };
  }

  /** Real link/self-post submission to a subreddit — `meta.subreddit` defaults to the business's own user profile. */
  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    const subreddit = (meta.subreddit as string | undefined) ?? 'u_self';
    const isLink = post.mediaUrls.length > 0;
    const params: Record<string, string> = {
      sr: subreddit,
      kind: isLink ? 'link' : 'self',
      title: post.caption,
    };
    if (isLink) params.url = post.mediaUrls[0];
    else params.text = post.caption;

    const response = await axios.post<{ json: { data: { id: string } } }>(
      `${API}/api/submit`,
      new URLSearchParams(params),
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return { externalId: response.data.json.data.id };
  }

  async fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]> {
    const kind = (meta.inboxKind as string | undefined) ?? 'comments';
    const response = await axios.get<{
      data: {
        children: {
          data: {
            name: string;
            body: string;
            author: string;
            created_utc: number;
            link_id?: string;
          };
        }[];
      };
    }>(`${API}/message/${kind}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return response.data.data.children.map((c) => ({
      externalId: c.data.name,
      kind: kind === 'comments' ? 'comment' : 'dm',
      authorName: c.data.author,
      text: c.data.body,
      postExternalId: c.data.link_id,
      receivedAt: new Date(c.data.created_utc * 1000).toISOString(),
    }));
  }

  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    await axios.post(
      `${API}/api/comment`,
      new URLSearchParams({ thing_id: target.externalId, text }),
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
  }

  async fetchInsights(
    tokens: SocialOAuthTokens,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- karma is a whole-account metric; no extra targeting context is needed.
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    const response = await axios.get<{
      link_karma: number;
      comment_karma: number;
    }>(`${API}/api/v1/me`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return {
      followers: 0,
      reach: response.data.link_karma,
      impressions: 0,
      engagement: response.data.comment_karma,
    };
  }
}
