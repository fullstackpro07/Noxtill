import { SegmentsService } from './segments.service';
export declare class SegmentsController {
    private readonly segmentsService;
    constructor(segmentsService: SegmentsService);
    getSegment(key: string): Promise<{
        key: string;
        count: number;
        members: {
            name: string;
            email: string | null;
            phone: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            address: string | null;
            birthday: Date | null;
            notes: string | null;
            tags: string[];
            consentMarketing: boolean;
            optedOut: boolean;
            lifetimeSpend: import("generated/prisma/runtime/library").Decimal;
            visitCount: number;
            lastVisitAt: Date | null;
        }[];
    }>;
}
