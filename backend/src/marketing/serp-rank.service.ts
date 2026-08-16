import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosResponse } from 'axios';

interface SerpApiOrganicResult {
  position: number;
  title: string;
  link: string;
}

interface SerpApiResponse {
  organic_results?: SerpApiOrganicResult[];
}

/**
 * Real SERP rank lookup (keyword tracking, BE-063 extension) via a SerpApi-shaped provider. Needs
 * `SERPAPI_KEY` in the environment — same disclosed-gap pattern as GOOGLE_PLACES_API_KEY/
 * ANTHROPIC_API_KEY elsewhere in this app when the key is unconfigured.
 *
 * There's no stored website/domain for a business in this schema, so matching "is this business in
 * the results" is a best-effort substring match against the business's own name in each result's
 * title — an honest approximation, not a precise domain match.
 */
@Injectable()
export class SerpRankService {
  private readonly logger = new Logger(SerpRankService.name);

  constructor(private readonly config: ConfigService) {}

  async fetchRank(
    keyword: string,
    businessName: string,
  ): Promise<number | null> {
    const apiKey = this.config.get<string>('SERPAPI_KEY');

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
      // A missing/invalid key or a provider outage means "couldn't check this cycle", not a crash —
      // unlike Google Places (which returns 200 + an error status field), SerpApi throws on bad auth.
      const message: unknown = axios.isAxiosError(error)
        ? error.response?.data
        : (error as Error).message;
      this.logger.warn(
        `SERP rank lookup failed for "${keyword}": ${JSON.stringify(message)}`,
      );
      return null;
    }

    const results = response.data.organic_results ?? [];
    const needle = businessName.trim().toLowerCase();
    const match = results.find((r) => r.title.toLowerCase().includes(needle));

    if (!match) {
      this.logger.debug(
        `No SERP match for "${businessName}" in results for "${keyword}"`,
      );
      return null;
    }
    return match.position;
  }
}
