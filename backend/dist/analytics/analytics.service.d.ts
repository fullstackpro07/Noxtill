import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
export declare class AnalyticsService {
    private readonly tenantPrisma;
    private readonly cls;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService);
    kpis(): Promise<{
        revenueThisMonth: number;
        grossProfitThisMonth: number;
        ordersThisMonth: number;
        avgOrderValue: number;
        newCustomersThisMonth: number;
        appointmentsBookedThisMonth: number;
        reviewsAverage: number | null;
    }>;
    revenueSeries(days?: number): Promise<{
        date: string;
        orders: number;
        revenue: number;
        grossProfit: number;
    }[]>;
    cohorts(): Promise<{
        cohortMonth: string;
        size: number;
        retention: number[];
    }[]>;
    campaigns(): Promise<{
        campaignId: string;
        segment: string;
        sent: number;
        delivered: number;
        read: number;
        failed: number;
    }[]>;
    staff(): Promise<{
        name: string;
        totalSales: number;
        orders: number;
    }[]>;
    channels(days?: number): Promise<{
        [k: string]: Record<string, number>;
    }>;
}
