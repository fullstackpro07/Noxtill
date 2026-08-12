import { HealthScoreService } from './health-score.service';
import { UpdateHealthScoreWeightsDto } from './dto/update-health-score-weights.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class HealthScoreController {
    private readonly healthScoreService;
    constructor(healthScoreService: HealthScoreService);
    getScore(user: AuthenticatedUser, range?: string): Promise<{
        score: number;
        components: {
            ratingTrend: number;
            repeatCustomerRate: number;
            margin: number;
            creditRecovery: number;
        };
        weights: import("./health-score.service").HealthScoreWeights;
        history: {
            capturedAt: Date;
            totalScore: number;
            ratingTrend: number;
            repeatCustomerRate: number;
            margin: number;
            creditRecovery: number;
        }[];
    }>;
    updateWeights(user: AuthenticatedUser, dto: UpdateHealthScoreWeightsDto): Promise<import("./health-score.service").HealthScoreWeights>;
}
