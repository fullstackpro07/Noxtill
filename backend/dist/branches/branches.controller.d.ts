import { RollupService } from './rollup.service';
import { BranchAdvisorService } from './branch-advisor.service';
import { BranchAdvisorDto } from './dto/branch-advisor.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class BranchesController {
    private readonly rollupService;
    private readonly branchAdvisorService;
    constructor(rollupService: RollupService, branchAdvisorService: BranchAdvisorService);
    dashboard(user: AuthenticatedUser, days?: string): Promise<{
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
    compare(user: AuthenticatedUser, weeks?: string): Promise<{
        businessId: string;
        name: string;
        weeks: {
            weekStart: string;
            ordersCount: number;
            revenue: number;
            grossProfit: number;
        }[];
    }[]>;
    branchAdvisor(user: AuthenticatedUser, dto: BranchAdvisorDto): Promise<{
        answer: string;
        disclaimer: string;
    }>;
}
