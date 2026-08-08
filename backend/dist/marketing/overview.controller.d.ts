import { MarketingOverviewService } from './overview.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class OverviewController {
    private readonly overview;
    constructor(overview: MarketingOverviewService);
    get(user: AuthenticatedUser): Promise<import("./overview.service").ChannelOverviewRow[]>;
}
