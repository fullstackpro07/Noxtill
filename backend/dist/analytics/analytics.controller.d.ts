import { AnalyticsService } from './analytics.service';
export declare class AnalyticsController {
    private readonly analyticsService;
    constructor(analyticsService: AnalyticsService);
    kpis(): Promise<{
        revenueThisMonth: number;
        grossProfitThisMonth: number;
        ordersThisMonth: number;
        avgOrderValue: number;
        newCustomersThisMonth: number;
        appointmentsBookedThisMonth: number;
        reviewsAverage: number | null;
    }>;
    revenueSeries(days?: string): Promise<{
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
    channels(days?: string): Promise<{
        [k: string]: Record<string, number>;
    }>;
}
