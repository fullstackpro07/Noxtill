import { MarketingOverviewService } from './overview.service';
export declare class OverviewController {
    private readonly overview;
    constructor(overview: MarketingOverviewService);
    get(): Promise<import("./overview.service").ChannelOverviewRow[]>;
}
