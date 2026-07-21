import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service';
export interface AuditLogParams {
    entity: string;
    entityId: string;
    action: string;
    before?: unknown;
    after?: unknown;
}
export declare class AuditService {
    private readonly tenantPrisma;
    private readonly cls;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService);
    log(params: AuditLogParams): Promise<void>;
}
