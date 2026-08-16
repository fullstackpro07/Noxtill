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
var SerpRankService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SerpRankService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let SerpRankService = SerpRankService_1 = class SerpRankService {
    config;
    logger = new common_1.Logger(SerpRankService_1.name);
    constructor(config) {
        this.config = config;
    }
    async fetchRank(keyword, businessName) {
        const apiKey = this.config.get('SERPAPI_KEY');
        let response;
        try {
            response = await axios_1.default.get('https://serpapi.com/search', {
                params: {
                    engine: 'google',
                    q: keyword,
                    api_key: apiKey ?? '',
                },
            });
        }
        catch (error) {
            const message = axios_1.default.isAxiosError(error)
                ? error.response?.data
                : error.message;
            this.logger.warn(`SERP rank lookup failed for "${keyword}": ${JSON.stringify(message)}`);
            return null;
        }
        const results = response.data.organic_results ?? [];
        const needle = businessName.trim().toLowerCase();
        const match = results.find((r) => r.title.toLowerCase().includes(needle));
        if (!match) {
            this.logger.debug(`No SERP match for "${businessName}" in results for "${keyword}"`);
            return null;
        }
        return match.position;
    }
};
exports.SerpRankService = SerpRankService;
exports.SerpRankService = SerpRankService = SerpRankService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SerpRankService);
//# sourceMappingURL=serp-rank.service.js.map