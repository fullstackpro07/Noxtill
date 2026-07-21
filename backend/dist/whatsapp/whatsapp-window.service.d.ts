import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
export declare class WhatsappWindowService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    refresh(businessId: string, customerId: string): Promise<void>;
    isOpen(businessId: string, customerId: string): Promise<boolean>;
}
