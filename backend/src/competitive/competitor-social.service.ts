import { Injectable, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SocialAccountsService } from '../social/social-accounts.service';

const GRAPH = 'https://graph.facebook.com/v19.0';
const MEDIA_SAMPLE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CompetitorSocialResult =
  | {
      status: 'ok';
      handle: string;
      followers: number | null;
      mediaCount: number | null;
      postsLast30: number;
      postsPrev30: number;
      /** True when the sample was full and still reached inside the counted windows — the real count may be higher. */
      capped: boolean;
      formats: { image: number; video: number; carousel: number };
      /** Most-used hashtags across the sampled captions (up to three). */
      topics: string[];
      latestAt: string | null;
    }
  | {
      status: 'no_handle' | 'not_connected' | 'unavailable';
      message: string;
    };

interface DiscoveryMedia {
  timestamp?: string;
  media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  caption?: string;
}

interface DiscoveryResponse {
  business_discovery?: {
    followers_count?: number;
    media_count?: number;
    media?: { data?: DiscoveryMedia[] };
  };
}

/**
 * A competitor's public Instagram posting, read through Instagram **Business Discovery** — the
 * documented Graph API way to read another business/creator account's public profile and media,
 * called with the business's OWN connected Instagram account. Nothing is scraped and nothing behind
 * a login is touched. It only works when (a) the business has connected Instagram in Social and
 * (b) the competitor has an Instagram handle set and runs a business or creator account — every
 * other case comes back as an explicit status, never as "zero posts".
 */
@Injectable()
export class CompetitorSocialService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly accounts: SocialAccountsService,
  ) {}

  async get(
    businessId: string,
    competitorId: string,
  ): Promise<CompetitorSocialResult> {
    const competitor = await this.tenantPrisma.client.competitor.findUnique({
      where: { id: competitorId },
    });
    if (!competitor) throw new NotFoundException('Competitor not found');

    if (!competitor.instagramHandle) {
      return {
        status: 'no_handle',
        message: `Add the Instagram username for ${competitor.name} to read their public posting.`,
      };
    }

    const account = await this.accounts.getAccount(businessId, 'instagram');
    const tokens = await this.accounts.getTokens(businessId, 'instagram');
    const igUserId = (account?.meta as Record<string, unknown> | undefined)
      ?.igUserId as string | undefined;
    if (account?.status !== 'connected' || !tokens || !igUserId) {
      return {
        status: 'not_connected',
        message:
          'Connect your own Instagram business account in Social first. Instagram only lets a connected business look up another business’s public posts.',
      };
    }

    const handle = competitor.instagramHandle;
    let payload: DiscoveryResponse;
    try {
      const response = await axios.get<DiscoveryResponse>(
        `${GRAPH}/${igUserId}`,
        {
          params: {
            fields: `business_discovery.username(${handle}){followers_count,media_count,media.limit(${MEDIA_SAMPLE}){timestamp,media_type,caption}}`,
            access_token: tokens.accessToken,
          },
        },
      );
      payload = response.data;
    } catch (error) {
      const graphMessage = (
        error as { response?: { data?: { error?: { message?: string } } } }
      ).response?.data?.error?.message;
      return {
        status: 'unavailable',
        message:
          graphMessage ??
          `Instagram did not return data for @${handle}. It must be a public business or creator account.`,
      };
    }

    const discovery = payload.business_discovery;
    if (!discovery) {
      return {
        status: 'unavailable',
        message: `Instagram did not return data for @${handle}. It must be a public business or creator account.`,
      };
    }
    return this.summarise(handle, discovery);
  }

  private summarise(
    handle: string,
    discovery: NonNullable<DiscoveryResponse['business_discovery']>,
  ): CompetitorSocialResult {
    const media = (discovery.media?.data ?? []).filter((m) => !!m.timestamp);
    const now = Date.now();
    const age = (m: DiscoveryMedia) =>
      now - new Date(m.timestamp as string).getTime();

    const last30 = media.filter((m) => age(m) <= 30 * DAY_MS);
    const prev30 = media.filter(
      (m) => age(m) > 30 * DAY_MS && age(m) <= 60 * DAY_MS,
    );
    const oldest = media.length ? Math.max(...media.map(age)) : 0;
    // A full sample whose oldest item is still inside the counted windows means older posts were cut off.
    const capped = media.length >= MEDIA_SAMPLE && oldest <= 60 * DAY_MS;

    const tagCounts = new Map<string, number>();
    for (const m of media) {
      for (const tag of (m.caption ?? '').match(/#[\p{L}\p{N}_]+/gu) ?? []) {
        const key = tag.toLowerCase();
        tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
      }
    }
    const topics = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => tag);

    const newestAge = media.length ? Math.min(...media.map(age)) : null;
    return {
      status: 'ok',
      handle,
      followers: discovery.followers_count ?? null,
      mediaCount: discovery.media_count ?? null,
      postsLast30: last30.length,
      postsPrev30: prev30.length,
      capped,
      formats: {
        image: last30.filter((m) => m.media_type === 'IMAGE').length,
        video: last30.filter((m) => m.media_type === 'VIDEO').length,
        carousel: last30.filter((m) => m.media_type === 'CAROUSEL_ALBUM')
          .length,
      },
      topics,
      latestAt:
        newestAge != null ? new Date(now - newestAge).toISOString() : null,
    };
  }
}
