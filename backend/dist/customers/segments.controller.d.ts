import { SegmentsService } from './segments.service';
export declare class SegmentsController {
    private readonly segmentsService;
    constructor(segmentsService: SegmentsService);
    getSegment(key: string): Promise<{
        key: string;
        count: number;
        members: {
            id: string;
            email: string | null;
            phone: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            birthday: Date | null;
            address: string | null;
            notes: string | null;
            tags: string[];
            consentMarketing: boolean;
            optedOut: boolean;
            lifetimeSpend: import("generated/prisma/runtime/library").Decimal;
            visitCount: number;
            lastVisitAt: Date | null;
            referredByCustomerId: string | null;
            referralRewardedAt: Date | null;
        }[];
    }>;
}
