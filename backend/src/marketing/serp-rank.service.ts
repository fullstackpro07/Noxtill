import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import { AppException } from '../common/filters/app.exception';
import { MARKETING_ERROR_CODES } from './marketing.constants';

interface SerpApiOrganicResult {
  position: number;
  title: string;
  link: string;
}

interface SerpApiResponse {
  organic_results?: SerpApiOrganicResult[];
}

function normalizeWebsiteHost(
  website: string | null | undefined,
): string | null {
  const input = website?.trim();
  if (!input) return null;

  try {
    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(input);
    const hostWithPort = /^[^/]+:\d+(?:\/|$)/.test(input);
    const withProtocol =
      hasScheme && !hostWithPort ? input : `https://${input}`;
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/\.$/, '');
  } catch {
    return null;
  }
}

function resultMatchesWebsite(link: string, websiteHost: string): boolean {
  const resultHost = normalizeWebsiteHost(link);
  return (
    resultHost === websiteHost ||
    (resultHost !== null && resultHost.endsWith(`.${websiteHost}`))
  );
}

export interface SerpRankResult {
  rank: number | null;
  /** Keyword Rankings depth fix — the #1 organic result's title, captured from this SAME call (no extra API hit). */
  topResultTitle: string | null;
  /** Distinct canonical pages on this business's domain returned in the same organic SERP response. */
  businessResultUrls: string[];
}

function canonicalPageUrl(link: string): string {
  const url = new URL(link);
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|gclid|fbclid|ref|source|campaign)$/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  url.hash = '';
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

/**
 * Real SERP rank lookup (keyword tracking, BE-063 extension) via a SerpApi-shaped provider. Needs
 * `SERPAPI_KEY` in the environment. Missing configuration or provider failures are raised as
 * typed service-unavailable errors so they cannot be persisted as a real "not ranked" result.
 *
 * Ranking is matched only against the canonical MasterListing website hostname (including its
 * subdomains). Without a valid configured website, no result is recorded; matching a business name
 * in a third-party result title is not sufficient evidence of the business's own rank.
 */
@Injectable()
export class SerpRankService {
  private readonly logger = new Logger(SerpRankService.name);

  constructor(private readonly config: ConfigService) {}

  async fetchRank(
    keyword: string,
    businessName: string,
    website?: string | null,
  ): Promise<SerpRankResult> {
    if (!website?.trim()) {
      throw new AppException(
        MARKETING_ERROR_CODES.SEO_SITE_NOT_CONFIGURED,
        'Add your website in Business Listings before checking keyword positions.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const websiteHost = normalizeWebsiteHost(website);
    if (!websiteHost) {
      throw new AppException(
        MARKETING_ERROR_CODES.SEO_SITE_URL_INVALID,
        'The website in Business Listings is invalid or uses an unsupported address.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const apiKey = this.config.get<string>('SERPAPI_KEY')?.trim();
    if (!apiKey) {
      throw new AppException(
        MARKETING_ERROR_CODES.SERP_PROVIDER_NOT_CONFIGURED,
        'Rank provider is not configured. Configure SERPAPI_KEY on the server to check keyword positions.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    let response: AxiosResponse<SerpApiResponse>;
    try {
      response = await axios.get<SerpApiResponse>(
        'https://serpapi.com/search',
        {
          params: {
            engine: 'google',
            q: keyword,
            api_key: apiKey ?? '',
          },
        },
      );
    } catch (error) {
      const status = axios.isAxiosError(error)
        ? (error.response?.status ?? 'network error')
        : 'request error';
      this.logger.warn(`SERP rank lookup failed (${status})`);
      throw new AppException(
        MARKETING_ERROR_CODES.SERP_PROVIDER_UNAVAILABLE,
        'Search ranking provider could not complete the check. Try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const results = response.data.organic_results ?? [];
    const match = results.find((result) =>
      resultMatchesWebsite(result.link, websiteHost),
    );
    const topResultTitle = results[0]?.title ?? null;
    const businessResultUrls = [
      ...new Set(
        results
          .filter((result) => resultMatchesWebsite(result.link, websiteHost))
          .map((result) => canonicalPageUrl(result.link)),
      ),
    ];

    if (!match) {
      this.logger.debug(
        `No SERP match for "${businessName}" in results for "${keyword}"`,
      );
      return { rank: null, topResultTitle, businessResultUrls };
    }
    return { rank: match.position, topResultTitle, businessResultUrls };
  }
}
