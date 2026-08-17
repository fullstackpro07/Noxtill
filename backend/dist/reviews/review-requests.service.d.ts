import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { CreateReviewRequestDto } from './dto/create-review-request.dto';
export declare class ReviewRequestsService {
    private readonly tenantPrisma;
    private readonly sendGate;
    constructor(tenantPrisma: TenantPrismaService, sendGate: SendGateService);
    create(businessId: string, dto: CreateReviewRequestDto): Promise<{
        message: string | null;
        id: string;
        createdAt: Date;
        businessId: string;
        token: string;
        customerId: string | null;
        source: string;
        sourceId: string | null;
        stars: number | null;
        routedTo: import("generated/prisma").$Enums.ReviewRoute | null;
        reminderCount: number;
        respondedAt: Date | null;
    }>;
    scheduleSend(businessId: string, customerId: string, token: string): Promise<void>;
}
