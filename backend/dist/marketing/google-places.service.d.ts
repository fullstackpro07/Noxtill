import { ConfigService } from '@nestjs/config';
export interface PlaceSnapshot {
    rating: number;
    reviewsCount: number;
}
export declare class GooglePlacesService {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    fetchPlaceSnapshot(placeId: string): Promise<PlaceSnapshot | null>;
}
