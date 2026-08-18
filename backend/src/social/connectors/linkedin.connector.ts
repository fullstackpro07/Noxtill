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

const API = 'https://api.linkedin.com/v2';

@Injectable()
export class LinkedinConnector extends StandardOAuth2Connector {
  readonly platform = SocialPlatform.linkedin;
  protected readonly oauth: StandardOAuth2Config = {
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scope: 'w_member_social r_organization_social',
    clientIdEnvKey: 'LINKEDIN_CLIENT_ID',
    clientSecretEnvKey: 'LINKEDIN_CLIENT_SECRET',
    redirectSegment: 'linkedin',
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
      id: string;
      localizedFirstName: string;
    }>(`${API}/me`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return {
      externalAccountId: response.data.id,
      externalAccountName: response.data.localizedFirstName,
    };
  }

  /** Real UGC Posts API — the standard way to publish on behalf of a member or organization. */
  async publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult> {
    const authorUrn = meta.authorUrn as string | undefined;
    const response = await axios.post<{ id: string }>(
      `${API}/ugcPosts`,
      {
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: post.caption },
            shareMediaCategory: post.mediaUrls.length ? 'IMAGE' : 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return { externalId: response.data.id };
  }

  async fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]> {
    const shareUrn = meta.shareUrn as string | undefined;
    if (!shareUrn) return [];
    const response = await axios.get<{
      elements: {
        $URN: string;
        actor: string;
        message: { text: string };
        created: { time: number };
      }[];
    }>(`${API}/socialActions/${encodeURIComponent(shareUrn)}/comments`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return response.data.elements.map((c) => ({
      externalId: c.$URN,
      kind: 'comment',
      authorName: c.actor,
      text: c.message.text,
      postExternalId: shareUrn,
      receivedAt: new Date(c.created.time).toISOString(),
    }));
  }

  async replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void> {
    await axios.post(
      `${API}/socialActions/${encodeURIComponent(target.externalId)}/comments`,
      { message: { text } },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
  }

  async fetchInsights(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInsights> {
    const organizationUrn = meta.organizationUrn as string | undefined;
    const response = await axios.get<{
      elements: {
        totalShareStatistics: {
          impressionCount: number;
          shareCount: number;
          engagement: number;
        };
      }[];
    }>(`${API}/organizationalEntityShareStatistics`, {
      params: {
        q: 'organizationalEntity',
        organizationalEntity: organizationUrn,
      },
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const stats = response.data.elements[0]?.totalShareStatistics;
    return {
      followers: 0,
      reach: stats?.shareCount ?? 0,
      impressions: stats?.impressionCount ?? 0,
      engagement: stats?.engagement ?? 0,
    };
  }
}
