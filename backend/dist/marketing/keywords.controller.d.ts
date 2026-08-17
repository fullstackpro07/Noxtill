import { KeywordsService } from './keywords.service';
import { CreateTrackedKeywordDto } from './dto/create-tracked-keyword.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class KeywordsController {
    private readonly keywordsService;
    constructor(keywordsService: KeywordsService);
    list(): Promise<{
        id: string;
        keyword: string;
        latestRank: number | null;
        lastCheckedAt: string;
    }[]>;
    create(user: AuthenticatedUser, dto: CreateTrackedKeywordDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        keyword: string;
    }>;
    remove(id: string): Promise<{
        success: boolean;
    }>;
    history(id: string): Promise<{
        rank: number | null;
        capturedAt: string;
    }[]>;
    triggerCheck(user: AuthenticatedUser, id: string): Promise<{
        rank: number | null;
        capturedAt: string;
    }[]>;
}
