import { PrismaService } from '../prisma/prisma.service';
export declare class PlanAssignmentService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    assignByStripePriceId(businessId: string, stripePriceId: string): Promise<void>;
    downgradeToBasic(businessId: string): Promise<void>;
}
