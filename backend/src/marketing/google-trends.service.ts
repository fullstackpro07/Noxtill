import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface TrendsTimelinePoint {
  values: { extracted_value?: number }[];
}

interface GoogleTrendsResponse {
  interest_over_time?: { timeline_data?: TrendsTimelinePoint[] };
}

/**
 * Keyword Rankings depth fix — a real "search interest" proxy via SerpApi's `google_trends` engine
 * (same `SERPAPI_KEY` already used by `SerpRankService`, no new provider/credential needed).
 * Deliberately NOT presented as an exact monthly search-volume count: Google Trends returns a
 * relative 0-100 index over the requested window, which is what's genuinely available without a
 * paid keyword-research API (Google Ads Keyword Planner, Ahrefs, Semrush, etc. — none integrated
 * here). Returns null (never a fabricated number) when the key is missing or the provider has no
 * data for the term.
 */
@Injectable()
export class GoogleTrendsService {
  private readonly logger = new Logger(GoogleTrendsService.name);

  constructor(private readonly config: ConfigService) {}

  async fetchInterest(keyword: string): Promise<number | null> {
    const apiKey = this.config.get<string>('SERPAPI_KEY');

    let response: { data: GoogleTrendsResponse };
    try {
      response = await axios.get<GoogleTrendsResponse>(
        'https://serpapi.com/search',
        {
          params: {
            engine: 'google_trends',
            q: keyword,
            data_type: 'TIMESERIES',
            api_key: apiKey ?? '',
          },
        },
      );
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as unknown)
        : (error as Error).message;
      this.logger.warn(
        `Google Trends lookup failed for "${keyword}": ${JSON.stringify(message)}`,
      );
      return null;
    }

    const timeline = response.data.interest_over_time?.timeline_data ?? [];
    const latest = timeline[timeline.length - 1];
    const value = latest?.values?.[0]?.extracted_value;
    return typeof value === 'number' ? value : null;
  }
}
