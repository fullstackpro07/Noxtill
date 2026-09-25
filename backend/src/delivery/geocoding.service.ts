import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface GeocodeResponse {
  status: string;
  results: { geometry: { location: { lat: number; lng: number } } }[];
}

/**
 * Turns a typed delivery address into coordinates through the same optional maps provider key the
 * route optimiser already uses. With no key configured (or no match) it returns null and the
 * delivery simply has no coordinates — distance, fee-by-distance and the map then say so, rather
 * than the address being placed anywhere made up.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(private readonly config: ConfigService) {}

  async geocode(address: string): Promise<{ lat: number; lng: number } | null> {
    const apiKey = this.config.get<string>('MAPS_PROVIDER_API_KEY');
    if (!apiKey || !address.trim()) return null;
    try {
      const { data } = await axios.get<GeocodeResponse>(
        'https://maps.googleapis.com/maps/api/geocode/json',
        { params: { address, key: apiKey }, timeout: 5000 },
      );
      const loc =
        data.status === 'OK' ? data.results[0]?.geometry.location : null;
      return loc ? { lat: loc.lat, lng: loc.lng } : null;
    } catch (error) {
      this.logger.warn(`Geocoding failed: ${(error as Error).message}`);
      return null;
    }
  }
}
