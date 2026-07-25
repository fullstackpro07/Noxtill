import { CompetitorsService } from './competitors.service';
import { CreateCompetitorDto } from './dto/create-competitor.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class CompetitorsController {
    private readonly competitorsService;
    constructor(competitorsService: CompetitorsService);
    list(): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        platformRef: string;
        lastRating: import("generated/prisma/runtime/library").Decimal | null;
        lastReviewsCount: number | null;
    }[]>;
    create(user: AuthenticatedUser, dto: CreateCompetitorDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        platformRef: string;
        lastRating: import("generated/prisma/runtime/library").Decimal | null;
        lastReviewsCount: number | null;
    }>;
    remove(id: string): Promise<{
        success: boolean;
    }>;
}
