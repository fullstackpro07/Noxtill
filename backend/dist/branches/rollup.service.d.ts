import { PrismaService } from '../prisma/prisma.service';
export declare class RollupService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private getGroup;
    dashboard(businessId: string, days?: number): Promise<{
        totals: {
            ordersCount: number;
            revenue: number;
            grossProfit: number;
        };
        branches: {
            businessId: string;
            name: string;
            ordersCount: number;
            revenue: number;
            grossProfit: number;
        }[];
    }>;
    compare(businessId: string, weeks?: number): Promise<{
        businessId: string;
        name: string;
        weeks: {
            weekStart: string;
            ordersCount: number;
            revenue: number;
            grossProfit: number;
        }[];
    }[]>;
}
