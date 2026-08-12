import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ProfitService } from '../profit/profit.service';
export type HealthScoreWeights = Record<'ratingTrend' | 'repeatCustomerRate' | 'margin' | 'creditRecovery', number>;
export declare class HealthScoreService {
    private readonly tenantPrisma;
    private readonly profitService;
    constructor(tenantPrisma: TenantPrismaService, profitService: ProfitService);
    getWeights(businessId: string): Promise<HealthScoreWeights>;
    updateWeights(businessId: string, weights: HealthScoreWeights): Promise<HealthScoreWeights>;
    getScore(businessId: string, range?: string): Promise<{
        score: number;
        components: {
            ratingTrend: number;
            repeatCustomerRate: number;
            margin: number;
            creditRecovery: number;
        };
        weights: HealthScoreWeights;
        history: {
            capturedAt: Date;
            totalScore: number;
            ratingTrend: number;
            repeatCustomerRate: number;
            margin: number;
            creditRecovery: number;
        }[];
    }>;
    computeRawComponents(businessId: string): Promise<{
        ratingTrend: number;
        repeatCustomerRate: number;
        margin: number;
        creditRecovery: number;
    }>;
    weightComponents(raw: {
        ratingTrend: number;
        repeatCustomerRate: number;
        margin: number;
        creditRecovery: number;
    }, weights: HealthScoreWeights): {
        ratingTrend: number;
        repeatCustomerRate: number;
        margin: number;
        creditRecovery: number;
    };
    private ratingTrendRaw;
    private repeatCustomerRateRaw;
    private marginRaw;
    private creditRecoveryRaw;
}
