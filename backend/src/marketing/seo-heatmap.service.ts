import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { MasterListingService } from '../listings/master-listing.service';
import { buildGrid } from './geo-grid.util';
import {
  SEO_HEATMAP_DEFAULT_RADIUS_KM,
  SEO_HEATMAP_DEFAULT_RING_POINTS,
  SEO_HEATMAP_ERROR_CODES,
} from './seo-heatmap.constants';
import type { SeoHeatmapPoint } from '@prisma/client';

interface GeocodeResponse {
  status: string;
  results: { geometry: { location: { lat: number; lng: number } } }[];
}

interface SerpLocalResult {
  position: number;
  title: string;
}

interface SerpApiLocalResponse {
  local_results?: { places?: SerpLocalResult[] } | SerpLocalResult[];
}

export interface SeoHeatmapScanResult {
  scanId: string;
  keyword: string;
  points: { lat: number; lng: number; rank: number | null }[];
}

/**
 * SEO Heatmap (UPD-BE-080) — extends `SerpRankService`'s single-point rank lookup (v1 INT-010)
 * into a real geo-grid: the business's own address (from the Master Business Record, UPD-BE-041)
 * is geocoded into a center point, a real compass-rose grid of points is built around it, and each
 * point gets its own real local-pack rank lookup. Same honest substring-match limitation as
 * `SerpRankService` (no stored domain to match precisely against).
 */
@Injectable()
export class SeoHeatmapService {
  private readonly logger = new Logger(SeoHeatmapService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly masterListing: MasterListingService,
    private readonly config: ConfigService,
  ) {}

  async list(
    businessId: string,
    keyword: string,
  ): Promise<{
    scanId: string | null;
    keyword: string;
    points: SeoHeatmapPoint[];
  }> {
    const latest = await this.tenantPrisma.client.seoHeatmapPoint.findFirst({
      where: { businessId, keyword },
      orderBy: { scannedAt: 'desc' },
    });
    if (!latest) return { scanId: null, keyword, points: [] };

    const points = await this.tenantPrisma.client.seoHeatmapPoint.findMany({
      where: { businessId, keyword, scanId: latest.scanId },
      orderBy: { scannedAt: 'asc' },
    });
    return { scanId: latest.scanId, keyword, points };
  }

  async scan(
    businessId: string,
    keyword: string,
    radiusKm: number = SEO_HEATMAP_DEFAULT_RADIUS_KM,
    ringPoints: number = SEO_HEATMAP_DEFAULT_RING_POINTS,
  ): Promise<SeoHeatmapScanResult> {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const listing = await this.masterListing.find(businessId);
    const addressParts = [
      listing?.addressLine1,
      listing?.city,
      listing?.state,
      listing?.postalCode,
      listing?.country,
    ].filter((part): part is string => !!part);
    if (addressParts.length === 0) {
      throw new AppException(
        SEO_HEATMAP_ERROR_CODES.NO_ADDRESS,
        'Set an address in the Master Business Record before scanning the SEO heatmap',
        HttpStatus.BAD_REQUEST,
      );
    }

    const center = await this.geocode(addressParts.join(', '));
    const grid = buildGrid(center, radiusKm, ringPoints);
    const scanId = randomUUID();

    const points: { lat: number; lng: number; rank: number | null }[] = [];
    for (const point of grid) {
      const rank = await this.fetchLocalPackRank(keyword, business.name, point);
      points.push({ ...point, rank });
      await this.tenantPrisma.client.seoHeatmapPoint.create({
        data: {
          businessId,
          scanId,
          keyword,
          lat: point.lat,
          lng: point.lng,
          rank,
        },
      });
    }

    return { scanId, keyword, points };
  }

  private async geocode(
    address: string,
  ): Promise<{ lat: number; lng: number }> {
    const apiKey = this.config.get<string>('MAPS_PROVIDER_API_KEY');
    if (!apiKey) {
      throw new AppException(
        SEO_HEATMAP_ERROR_CODES.MAPS_PROVIDER_NOT_CONFIGURED,
        'No maps/geocoding provider configured (MAPS_PROVIDER_API_KEY) — the SEO Heatmap needs one to locate the business',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const response = await axios.get<GeocodeResponse>(
      'https://maps.googleapis.com/maps/api/geocode/json',
      { params: { address, key: apiKey } },
    );
    const location = response.data.results[0]?.geometry.location;
    if (response.data.status !== 'OK' || !location) {
      throw new AppException(
        SEO_HEATMAP_ERROR_CODES.GEOCODE_FAILED,
        `Could not geocode the business address (${response.data.status})`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return location;
  }

  private async fetchLocalPackRank(
    keyword: string,
    businessName: string,
    point: { lat: number; lng: number },
  ): Promise<number | null> {
    const apiKey = this.config.get<string>('SERPAPI_KEY');
    try {
      const response = await axios.get<SerpApiLocalResponse>(
        'https://serpapi.com/search',
        {
          params: {
            engine: 'google',
            q: keyword,
            ll: `@${point.lat},${point.lng},14z`,
            api_key: apiKey ?? '',
          },
        },
      );
      const local = response.data.local_results;
      const places = Array.isArray(local) ? local : (local?.places ?? []);
      const needle = businessName.trim().toLowerCase();
      const match = places.find((p) => p.title.toLowerCase().includes(needle));
      return match?.position ?? null;
    } catch (error) {
      this.logger.warn(
        `SEO heatmap point lookup failed at (${point.lat},${point.lng}) for "${keyword}": ${(error as Error).message}`,
      );
      return null;
    }
  }
}
