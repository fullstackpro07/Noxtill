import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface PlaceSnapshot {
  rating: number;
  reviewsCount: number;
}

interface PlaceDetailsResponse {
  status: string;
  result?: { rating?: number; user_ratings_total?: number };
}

/**
 * Real Google Places "Place Details" lookup (BE-063) — competitors are tracked by a Google Place
 * ID (`platformRef`). Needs `GOOGLE_PLACES_API_KEY` in the environment; same disclosed-gap pattern
 * as ANTHROPIC_API_KEY/S3 credentials elsewhere in this app when the key is unconfigured.
 */
@Injectable()
export class GooglePlacesService {
  private readonly logger = new Logger(GooglePlacesService.name);

  constructor(private readonly config: ConfigService) {}

  async fetchPlaceSnapshot(placeId: string): Promise<PlaceSnapshot | null> {
    const apiKey = this.config.get<string>('GOOGLE_PLACES_API_KEY');

    const response = await axios.get<PlaceDetailsResponse>(
      'https://maps.googleapis.com/maps/api/place/details/json',
      {
        params: {
          place_id: placeId,
          fields: 'rating,user_ratings_total',
          key: apiKey ?? '',
        },
      },
    );

    const { status, result } = response.data;
    if (
      status !== 'OK' ||
      result?.rating == null ||
      result.user_ratings_total == null
    ) {
      this.logger.debug(
        `Google Places lookup for ${placeId} returned status=${status}`,
      );
      return null;
    }

    return { rating: result.rating, reviewsCount: result.user_ratings_total };
  }
}
