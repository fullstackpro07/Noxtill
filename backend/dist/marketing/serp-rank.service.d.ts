import { ConfigService } from '@nestjs/config';
export declare class SerpRankService {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    fetchRank(keyword: string, businessName: string): Promise<number | null>;
}
