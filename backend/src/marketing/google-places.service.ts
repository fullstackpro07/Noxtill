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

export interface PlaceSearchResult {
  placeId: string;
  name: string;
  address: string | null;
  rating: number | null;
  userRatingsTotal: number | null;
}

interface PlaceTextSearchResponse {
  status: string;
  results: {
    place_id: string;
    name: string;
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
  }[];
}

export interface PlaceReview {
  authorName: string;
  rating: number;
  text: string;
  relativeTime: string;
}

export interface PlaceDetailsFull {
  hours: string[] | null;
  reviews: PlaceReview[];
  photoReferences: string[];
}

interface PlaceDetailsFullResponse {
  status: string;
  result?: {
    opening_hours?: { weekday_text?: string[] };
    reviews?: {
      author_name: string;
      rating: number;
      text: string;
      relative_time_description: string;
    }[];
    photos?: { photo_reference: string }[];
  };
}

const MAX_DETAIL_PHOTOS = 6;

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

  /**
   * Competitor add-flow fix (UPD-BE-128) — real Google Places Text Search, replacing the previous
   * blind free-text `platformRef` entry. Returns `[]` (not an error) when `GOOGLE_PLACES_API_KEY`
   * isn't configured, same disclosed-gap pattern as `fetchPlaceSnapshot`, so the frontend can fall
   * back to manual entry rather than break.
   */
  async searchPlaces(query: string): Promise<PlaceSearchResult[]> {
    const apiKey = this.config.get<string>('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      this.logger.debug(
        'GOOGLE_PLACES_API_KEY not configured — returning no search results',
      );
      return [];
    }

    const response = await axios.get<PlaceTextSearchResponse>(
      'https://maps.googleapis.com/maps/api/place/textsearch/json',
      { params: { query, key: apiKey } },
    );

    if (response.data.status !== 'OK') {
      this.logger.debug(
        `Google Places text search for "${query}" returned status=${response.data.status}`,
      );
      return [];
    }

    return response.data.results.map((r) => ({
      placeId: r.place_id,
      name: r.name,
      address: r.formatted_address ?? null,
      rating: r.rating ?? null,
      userRatingsTotal: r.user_ratings_total ?? null,
    }));
  }

  /**
   * Competitor detail depth fix — real hours/reviews/photo-references from the SAME public Place
   * Details endpoint already used for the rating snapshot, just with a wider `fields` list. Returns
   * null (not an error) when the lookup fails — most commonly because `platformRef` was added via
   * free-text entry rather than a real Google Place ID, so there's nothing to look up.
   *
   * Deliberately does NOT attempt to surface a competitor's own Google Business Profile "posts" —
   * unlike rating/hours/reviews/photos, posts are never exposed by the public Places API at all;
   * they're only reachable via the Google Business Profile API under the PROFILE OWNER's own OAuth
   * consent, which this app has no path to obtain for a third-party competitor. That's a hard API
   * limitation, not a missing integration.
   */
  async fetchPlaceDetails(placeId: string): Promise<PlaceDetailsFull | null> {
    const apiKey = this.config.get<string>('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      this.logger.debug(
        'GOOGLE_PLACES_API_KEY not configured — returning no place details',
      );
      return null;
    }

    const response = await axios.get<PlaceDetailsFullResponse>(
      'https://maps.googleapis.com/maps/api/place/details/json',
      {
        params: {
          place_id: placeId,
          fields: 'opening_hours,reviews,photos',
          key: apiKey,
        },
      },
    );

    const { status, result } = response.data;
    if (status !== 'OK' || !result) {
      this.logger.debug(
        `Google Places details lookup for ${placeId} returned status=${status}`,
      );
      return null;
    }

    return {
      hours: result.opening_hours?.weekday_text ?? null,
      reviews: (result.reviews ?? []).map((r) => ({
        authorName: r.author_name,
        rating: r.rating,
        text: r.text,
        relativeTime: r.relative_time_description,
      })),
      photoReferences: (result.photos ?? [])
        .slice(0, MAX_DETAIL_PHOTOS)
        .map((p) => p.photo_reference),
    };
  }

  /** Real Place Photo API fetch, server-side only — the API key never reaches the client (see `CompetitorsService.details()`, which re-uploads the bytes to S3 and returns a signed URL instead). */
  async fetchPhoto(
    photoReference: string,
    maxWidth = 400,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const apiKey = this.config.get<string>('GOOGLE_PLACES_API_KEY');
    if (!apiKey) return null;

    try {
      const response = await axios.get<ArrayBuffer>(
        'https://maps.googleapis.com/maps/api/place/photo',
        {
          params: {
            photo_reference: photoReference,
            maxwidth: maxWidth,
            key: apiKey,
          },
          responseType: 'arraybuffer',
        },
      );
      const contentType =
        (response.headers['content-type'] as string) ?? 'image/jpeg';
      return { buffer: Buffer.from(response.data), contentType };
    } catch (error) {
      this.logger.warn(
        `Place photo fetch failed for ref ${photoReference}: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
