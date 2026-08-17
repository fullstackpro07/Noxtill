import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
export declare class AttendanceService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    toggle(businessId: string, userId: string): Promise<{
        id: string;
        createdAt: Date;
        businessId: string;
        staffUserId: string;
        checkIn: Date;
        checkOut: Date | null;
    }>;
}
