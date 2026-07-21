import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
export declare class ProfitService {
    private readonly tenantPrisma;
    private readonly cls;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService);
    byProduct(windowDays?: 30 | 90): Promise<{
        windowDays: 30 | 90;
        products: {
            productId: string;
            name: string;
            units: number;
            revenue: number;
            cost: number;
            profit: number;
            margin: number;
            reviewPricing: boolean;
            isTopPerformer: boolean;
        }[];
    }>;
    byTime(): Promise<{
        hourly: {
            hour: number;
            revenue: number;
        }[];
        weekday: {
            day: string;
            revenue: number;
        }[];
        insight: string;
    }>;
    private buildInsight;
    pnl(month: string): Promise<{
        month: string;
        revenue: number;
        cogs: number;
        expenses: {
            category: string;
            amount: number;
        }[];
        totalExpenses: number;
        netProfit: number;
    }>;
}
