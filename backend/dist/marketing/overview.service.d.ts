import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
export interface ChannelOverviewRow {
    channel: string;
    spend: number;
    results: number;
    costPerResult: number | null;
}
export declare class MarketingOverviewService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    overview(businessId: string): Promise<ChannelOverviewRow[]>;
    private toRow;
    private label;
}
