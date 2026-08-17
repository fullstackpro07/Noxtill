import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { TokenBasedConnector } from './token-based.connector';
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

const API = 'https://discord.com/api/v10';

/** Discord Bot API — the business submits their own Bot Token, verified via `/users/@me`. */
@Injectable()
export class DiscordConnector extends TokenBasedConnector {
  readonly platform = SocialPlatform.discord;

  protected async verifyToken(token: string): Promise<SocialAccountInfo> {
    const response = await axios.get<{ id: string; username: string }>(
      `${API}/users/@me`,
      {
        headers: { Authorization: `Bot ${token}` },
      },
    );
    return {
      externalAccountId: response.data.id,
      externalAccountName: response.data.username,
    };
  }

  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    const channelId = meta.channelId as string | undefined;
    const response = await axios.post<{ id: string }>(
      `${API}/channels/${channelId}/messages`,
      {
        content: post.mediaUrls.length
          ? `${post.caption}\n${post.mediaUrls[0]}`
          : post.caption,
      },
      { headers: { Authorization: `Bot ${tokens.accessToken}` } },
    );
    return { externalId: response.data.id };
  }

  async fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]> {
    const channelId = meta.channelId as string | undefined;
    if (!channelId) return [];
    const response = await axios.get<
      {
        id: string;
        content: string;
        author: { username: string };
        timestamp: string;
      }[]
    >(`${API}/channels/${channelId}/messages`, {
      params: { limit: 20 },
      headers: { Authorization: `Bot ${tokens.accessToken}` },
    });
    return response.data.map((m) => ({
      externalId: m.id,
      kind: 'comment',
      authorName: m.author.username,
      text: m.content,
      postExternalId: channelId,
      receivedAt: m.timestamp,
    }));
  }

  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    const channelId = target.postExternalId;
    await axios.post(
      `${API}/channels/${channelId}/messages`,
      { content: text, message_reference: { message_id: target.externalId } },
      { headers: { Authorization: `Bot ${tokens.accessToken}` } },
    );
  }

  /** Real member-count proxy for "followers" — Discord has no follower concept, only guild membership. */
  async fetchInsights(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    const guildId = meta.guildId as string | undefined;
    const response = await axios.get<{ approximate_member_count: number }>(
      `${API}/guilds/${guildId}`,
      {
        params: { with_counts: true },
        headers: { Authorization: `Bot ${tokens.accessToken}` },
      },
    );
    return {
      followers: response.data.approximate_member_count,
      reach: 0,
      impressions: 0,
      engagement: 0,
    };
  }
}
