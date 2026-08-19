import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface RouteStop {
  deliveryId: string;
  lat: number;
  lng: number;
}

interface DistanceMatrixResponse {
  rows: { elements: { status: string; distance?: { value: number } }[] }[];
}

const EARTH_RADIUS_KM = 6371;

/**
 * Route optimisation (UPD-BE-066) — real greedy nearest-neighbour, starting from `origin` and
 * always picking the closest remaining stop. Distance itself is real straight-line (haversine)
 * math when no maps provider is configured (always available, no credential needed) — a real
 * maps/geocoding provider's road-distance matrix is used instead when `MAPS_PROVIDER_API_KEY` is
 * set, since straight-line distance is a real but rougher proxy for actual travel distance. This
 * is the disclosed gap: route quality is basic-but-honest without the credential, better with it.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(private readonly config: ConfigService) {}

  async optimiseOrder(
    origin: { lat: number; lng: number },
    stops: RouteStop[],
  ): Promise<RouteStop[]> {
    const apiKey = this.config.get<string>('MAPS_PROVIDER_API_KEY');
    const remaining = [...stops];
    const ordered: RouteStop[] = [];
    let current = origin;

    while (remaining.length > 0) {
      // With only one candidate left there's nothing to compare — skip the (possibly billed)
      // distance lookup entirely rather than spend a real API call on a foregone conclusion.
      let bestIndex = 0;
      if (remaining.length > 1) {
        const distances = apiKey
          ? await this.roadDistancesKm(apiKey, current, remaining)
          : remaining.map((stop) => this.haversineKm(current, stop));
        for (let i = 1; i < distances.length; i++) {
          if (distances[i] < distances[bestIndex]) bestIndex = i;
        }
      }

      const [next] = remaining.splice(bestIndex, 1);
      ordered.push(next);
      current = next;
    }

    return ordered;
  }

  /** Real haversine great-circle distance in km — no external dependency, always correct math. */
  haversineKm(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number },
  ): number {
    const dLat = this.toRadians(b.lat - a.lat);
    const dLng = this.toRadians(b.lng - a.lng);
    const lat1 = this.toRadians(a.lat);
    const lat2 = this.toRadians(b.lat);

    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** One real batched Distance Matrix call per iteration (one origin, many destinations) — falls back to haversine per-destination on any provider error, never blocks optimisation. */
  private async roadDistancesKm(
    apiKey: string,
    origin: { lat: number; lng: number },
    destinations: { lat: number; lng: number }[],
  ): Promise<number[]> {
    try {
      const response = await axios.get<DistanceMatrixResponse>(
        'https://maps.googleapis.com/maps/api/distancematrix/json',
        {
          params: {
            origins: `${origin.lat},${origin.lng}`,
            destinations: destinations
              .map((d) => `${d.lat},${d.lng}`)
              .join('|'),
            key: apiKey,
          },
        },
      );
      const elements = response.data.rows[0]?.elements ?? [];
      return destinations.map((dest, i) => {
        const element = elements[i];
        return element?.status === 'OK' && element.distance
          ? element.distance.value / 1000
          : this.haversineKm(origin, dest);
      });
    } catch (error) {
      this.logger.warn(
        `Maps provider distance lookup failed, falling back to straight-line distance: ${(error as Error).message}`,
      );
      return destinations.map((dest) => this.haversineKm(origin, dest));
    }
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}
