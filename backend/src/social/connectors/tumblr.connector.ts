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

const API = 'https://api.tumblr.com/v2';

@Injectable()
export class TumblrConnector extends StandardOAuth2Connector {
  readonly platform = SocialPlatform.tumblr;
  protected readonly oauth: StandardOAuth2Config = {
    authorizeUrl: 'https://www.tumblr.com/oauth2/authorize',
    tokenUrl: `${API}/oauth2/token`,
    scope: 'write offline_access',
    clientIdEnvKey: 'TUMBLR_CLIENT_ID',
    clientSecretEnvKey: 'TUMBLR_CLIENT_SECRET',
    redirectSegment: 'tumblr',
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
      response: { user: { name: string; blogs: { name: string }[] } };
    }>(`${API}/user/info`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const user = response.data.response.user;
    return {
      externalAccountId: user.blogs[0]?.name ?? user.name,
      externalAccountName: user.name,
    };
  }

  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    const blogIdentifier = meta.blogIdentifier as string | undefined;
    const response = await axios.post<{ response: { id: number } }>(
      `${API}/blog/${blogIdentifier}/posts`,
      {
        content: [
          post.mediaUrls.length
            ? { type: 'image', media: [{ url: post.mediaUrls[0] }] }
            : { type: 'text', text: post.caption },
        ],
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return { externalId: String(response.data.response.id) };
  }

  /** Tumblr's comment-equivalent is "notes" (likes/reblogs-with-comment) on a post. */
  async fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]> {
    const blogIdentifier = meta.blogIdentifier as string | undefined;
    const postId = meta.recentPostId as string | undefined;
    if (!blogIdentifier || !postId) return [];
    const response = await axios.get<{
      response: {
        notes: {
          type: string;
          blog_name: string;
          timestamp: number;
          reply_text?: string;
        }[];
      };
    }>(`${API}/blog/${blogIdentifier}/notes`, {
      params: { id: postId, mode: 'conversation' },
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return response.data.response.notes
      .filter((n) => n.type === 'reply' && n.reply_text)
      .map((n) => ({
        externalId: `${postId}-${n.blog_name}-${n.timestamp}`,
        kind: 'comment',
        authorName: n.blog_name,
        text: n.reply_text ?? '',
        postExternalId: postId,
        receivedAt: new Date(n.timestamp * 1000).toISOString(),
      }));
  }

  /**
   * Tumblr's API has no direct "reply to a note" endpoint — the real primitive is reblogging the
   * parent post with a comment, which is why this needs `target.postExternalId`, same reasoning
   * as Pinterest's connector.
   */
  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    const postId = target.postExternalId ?? target.externalId;
    await axios.post(
      `${API}/blog/me/post/reblog`,
      { id: postId, comment: text },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
  }

  async fetchInsights(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    const blogIdentifier = meta.blogIdentifier as string | undefined;
    const response = await axios.get<{
      response: { blog: { followers: number; posts: number } };
    }>(`${API}/blog/${blogIdentifier}/info`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return {
      followers: response.data.response.blog.followers,
      reach: 0,
      impressions: 0,
      engagement: response.data.response.blog.posts,
    };
  }
}
