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

const API = 'https://api.weixin.qq.com/cgi-bin';

/**
 * WeChat Official Account — no user-facing OAuth for the business's OWN account management; the
 * business submits its AppID+AppSecret (as `"<appId>:<appSecret>"`), verified by exchanging it
 * for a real app-level access token.
 */
@Injectable()
export class WechatConnector extends TokenBasedConnector {
  readonly platform = SocialPlatform.wechat;

  protected async verifyToken(token: string): Promise<SocialAccountInfo> {
    const [appId, appSecret] = token.split(':');
    const response = await axios.get<{
      access_token: string;
      errcode?: number;
    }>(`${API}/token`, {
      params: {
        grant_type: 'client_credential',
        appid: appId,
        secret: appSecret,
      },
    });
    if (response.data.errcode) {
      throw new Error(
        `WeChat credential verification failed (errcode ${response.data.errcode})`,
      );
    }
    return { externalAccountId: appId };
  }

  /** Exchanges the stored `appId:appSecret` for a fresh access token — WeChat's app-level tokens expire hourly. */
  private async accessToken(tokens: SocialOAuthTokens): Promise<string> {
    const [appId, appSecret] = tokens.accessToken.split(':');
    const response = await axios.get<{ access_token: string }>(`${API}/token`, {
      params: {
        grant_type: 'client_credential',
        appid: appId,
        secret: appSecret,
      },
    });
    return response.data.access_token;
  }

  /** Mass-message send to all followers — the closest real primitive WeChat has to a generic "post". */
  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    const accessToken = await this.accessToken(tokens);
    const response = await axios.post<{ msg_id: number }>(
      `${API}/message/mass/send`,
      {
        filter: { is_to_all: meta.isToAll ?? true },
        text: { content: post.caption },
        msgtype: 'text',
      },
      { params: { access_token: accessToken } },
    );
    return { externalId: String(response.data.msg_id) };
  }

  /**
   * WeChat delivers inbound messages to the business's OWN configured webhook URL, not via a
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

  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    const accessToken = await this.accessToken(tokens);
    await axios.post(
      `${API}/message/custom/send`,
      { touser: target.externalId, text: { content: text }, msgtype: 'text' },
      { params: { access_token: accessToken } },
    );
  }

  async fetchInsights(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    const accessToken = await this.accessToken(tokens);
    const date = meta.date as string | undefined;
    const response = await axios.post<{
      list: { user_source: number; new_user: number; cancel_user: number }[];
    }>(
      'https://api.weixin.qq.com/datacube/getusersummary',
      { begin_date: date, end_date: date },
      { params: { access_token: accessToken } },
    );
    const totals = response.data.list.reduce(
      (sum, row) => sum + row.new_user - row.cancel_user,
      0,
    );
    return { followers: totals, reach: 0, impressions: 0, engagement: 0 };
  }
}
