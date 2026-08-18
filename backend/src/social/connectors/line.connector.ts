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

const API = 'https://api.line.me/v2/bot';

/** LINE Messaging API — the business submits its own long-lived Channel Access Token, verified via `/info`. */
@Injectable()
export class LineConnector extends TokenBasedConnector {
  readonly platform = SocialPlatform.line;

  protected async verifyToken(token: string): Promise<SocialAccountInfo> {
    const response = await axios.get<{ userId: string; displayName: string }>(
      `${API}/info`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return {
      externalAccountId: response.data.userId,
      externalAccountName: response.data.displayName,
    };
  }

  /** Broadcasts to every follower — LINE's real primitive closest to a generic "post". */
  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- broadcast always targets every follower; no per-post targeting exists to read from meta.
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    const messages = post.mediaUrls.length
      ? [
          { type: 'text', text: post.caption },
          {
            type: 'image',
            originalContentUrl: post.mediaUrls[0],
            previewImageUrl: post.mediaUrls[0],
          },
        ]
      : [{ type: 'text', text: post.caption }];
    await axios.post(
      `${API}/message/broadcast`,
      { messages },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    // LINE's broadcast endpoint returns no message id — the request itself succeeding is the only real signal.
    return { externalId: `broadcast-${Date.now()}` };
  }

  /**
   * LINE delivers inbound messages to the business's OWN configured webhook URL, not via a
   * pollable list endpoint — real ingestion happens through the shared social webhook controller
   * instead (see `SocialInboxController`). Nothing to fetch here.
   */
  /* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */
  async fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]> {
    return [];
  }
  /* eslint-enable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */

  /** `target.externalId` is the LINE userId (captured when the webhook ingests their message) — a real 1:1 push reply. */
  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    await axios.post(
      `${API}/message/push`,
      { to: target.externalId, messages: [{ type: 'text', text }] },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
  }

  async fetchInsights(
    tokens: SocialOAuthTokens,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- follower count is account-wide; no extra targeting context needed.
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    const response = await axios.get<{ followers: number }>(
      `${API}/insight/followers`,
      {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
    return {
      followers: response.data.followers,
      reach: 0,
      impressions: 0,
      engagement: 0,
    };
  }
}
