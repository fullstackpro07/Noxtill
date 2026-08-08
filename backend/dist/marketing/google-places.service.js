"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var GooglePlacesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GooglePlacesService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let GooglePlacesService = GooglePlacesService_1 = class GooglePlacesService {
    config;
    logger = new common_1.Logger(GooglePlacesService_1.name);
    constructor(config) {
        this.config = config;
    }
    async fetchPlaceSnapshot(placeId) {
        const apiKey = this.config.get('GOOGLE_PLACES_API_KEY');
        const response = await axios_1.default.get('https://maps.googleapis.com/maps/api/place/details/json', {
            params: {
                place_id: placeId,
                fields: 'rating,user_ratings_total',
                key: apiKey ?? '',
            },
        });
        const { status, result } = response.data;
        if (status !== 'OK' || result?.rating == null || result.user_ratings_total == null) {
            this.logger.debug(`Google Places lookup for ${placeId} returned status=${status}`);
            return null;
        }
        return { rating: result.rating, reviewsCount: result.user_ratings_total };
    }
};
exports.GooglePlacesService = GooglePlacesService;
exports.GooglePlacesService = GooglePlacesService = GooglePlacesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GooglePlacesService);
//# sourceMappingURL=google-places.service.js.map