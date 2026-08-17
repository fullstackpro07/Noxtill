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
import { SocialPlatform } from '@prisma/client';

/** Telegram Bot API — the business submits their own Bot Token (from @BotFather), verified via `getMe`. */
@Injectable()
export class TelegramConnector extends TokenBasedConnector {
  readonly platform = SocialPlatform.telegram;

  protected async verifyToken(token: string): Promise<SocialAccountInfo> {
    const response = await axios.get<{
      result: { id: number; username: string };
    }>(`https://api.telegram.org/bot${token}/getMe`);
    return {
      externalAccountId: String(response.data.result.id),
      externalAccountName: response.data.result.username,
    };
  }

  /** Posts to the configured channel/chat (`meta.chatId`) — a photo message when media is present, else plain text. */
  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    const chatId = meta.chatId as string | undefined;
    const method = post.mediaUrls.length ? 'sendPhoto' : 'sendMessage';
    const body = post.mediaUrls.length
      ? { chat_id: chatId, photo: post.mediaUrls[0], caption: post.caption }
      : { chat_id: chatId, text: post.caption };
    const response = await axios.post<{ result: { message_id: number } }>(
      `https://api.telegram.org/bot${tokens.accessToken}/${method}`,
      body,
    );
    return { externalId: String(response.data.result.message_id) };
  }

  /**
   * Real long-poll `getUpdates` — Telegram delivers new messages this way (or via a webhook, not
   * used here). `externalId` encodes `chatId:messageId` since replying needs both and the shared
   * `SocialInboxItem` row only carries one external id column.
   */
  async fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]> {
    const offset = meta.updateOffset as number | undefined;
    const response = await axios.get<{
      result: {
        update_id: number;
        message?: {
          message_id: number;
          text?: string;
          from?: { username: string };
          chat: { id: number };
          date: number;
        };
      }[];
    }>(`https://api.telegram.org/bot${tokens.accessToken}/getUpdates`, {
      params: { offset, timeout: 0 },
    });
    return response.data.result
      .filter((u) => u.message?.text)
      .map((u) => ({
        externalId: `${u.message!.chat.id}:${u.message!.message_id}`,
        kind: 'dm',
        authorName: u.message!.from?.username,
        text: u.message!.text ?? '',
        receivedAt: new Date(u.message!.date * 1000).toISOString(),
      }));
  }

  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    const [chatId, messageId] = target.externalId.split(':');
    await axios.post(
      `https://api.telegram.org/bot${tokens.accessToken}/sendMessage`,
      {
        chat_id: chatId,
        text,
        reply_to_message_id: Number(messageId),
      },
    );
  }

  /** Telegram's Bot API has no follower-count endpoint for channels the bot doesn't administer — `getChatMemberCount` on the configured chat is the real proxy. */
  async fetchInsights(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    const chatId = meta.chatId as string | undefined;
    const response = await axios.get<{ result: number }>(
      `https://api.telegram.org/bot${tokens.accessToken}/getChatMemberCount`,
      { params: { chat_id: chatId } },
    );
    return {
      followers: response.data.result,
      reach: 0,
      impressions: 0,
      engagement: 0,
    };
  }
}
