import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface CompetitorAd {
  adArchiveId: string;
  pageName: string;
  body: string | null;
  snapshotUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

interface AdLibraryResponse {
  data: {
    id: string;
    page_name: string;
    ad_creative_bodies?: string[];
    ad_snapshot_url?: string;
    ad_delivery_start_time?: string;
    ad_delivery_stop_time?: string;
  }[];
}

/**
 * Competitor Ads (UPD-BE-053) — real Meta Ad Library API lookup (public, no scraping) by the
 * competitor's Facebook Page ID. Needs `META_AD_LIBRARY_ACCESS_TOKEN`; same disclosed-gap pattern
 * as `GOOGLE_PLACES_API_KEY`/`SERPAPI_KEY` elsewhere in this module when the token is unconfigured.
 * `ad_delivery_start_time`/`ad_delivery_stop_time` are Meta's own fields — no local caching table
 * is needed to show "first/last seen", the API already returns it per ad.
 */
@Injectable()
export class MetaAdLibraryService {
  private readonly logger = new Logger(MetaAdLibraryService.name);

  constructor(private readonly config: ConfigService) {}

  async fetchAds(pageId: string): Promise<CompetitorAd[]> {
    const accessToken = this.config.get<string>('META_AD_LIBRARY_ACCESS_TOKEN');
    if (!accessToken) {
      this.logger.debug(
        'META_AD_LIBRARY_ACCESS_TOKEN not configured — returning no ads',
      );
      return [];
    }

    const response = await axios.get<AdLibraryResponse>(
      'https://graph.facebook.com/v19.0/ads_archive',
      {
        params: {
          search_page_ids: pageId,
          ad_reached_countries: JSON.stringify(['US']),
          ad_active_status: 'ALL',
          fields:
            'id,page_name,ad_creative_bodies,ad_snapshot_url,ad_delivery_start_time,ad_delivery_stop_time',
          access_token: accessToken,
        },
      },
    );

    return response.data.data.map((ad) => ({
      adArchiveId: ad.id,
      pageName: ad.page_name,
      body: ad.ad_creative_bodies?.[0] ?? null,
      snapshotUrl: ad.ad_snapshot_url ?? null,
      startedAt: ad.ad_delivery_start_time ?? null,
      endedAt: ad.ad_delivery_stop_time ?? null,
    }));
  }
}
