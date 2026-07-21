import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { Prisma } from '../../generated/prisma';
export declare class SegmentsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
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
            lifetimeSpend: Prisma.Decimal;
            visitCount: number;
            lastVisitAt: Date | null;
        }[];
    }>;
    private whereForKey;
}
