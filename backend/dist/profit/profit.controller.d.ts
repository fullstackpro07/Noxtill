import { ProfitService } from './profit.service';
import { QueryProfitProductsDto } from './dto/query-profit-products.dto';
import { QueryPnlDto } from './dto/query-pnl.dto';
export declare class ProfitController {
    private readonly profitService;
    constructor(profitService: ProfitService);
    byProduct(query: QueryProfitProductsDto): Promise<{
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
    pnl(query: QueryPnlDto): Promise<{
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
    bundleSuggestions(): Promise<{
        productAId: string;
        productBId: string;
        nameA: string;
        nameB: string;
        togetherCount: number;
        combinedPrice: number;
        suggestedPrice: number;
        pitch: string;
    }[]>;
}
