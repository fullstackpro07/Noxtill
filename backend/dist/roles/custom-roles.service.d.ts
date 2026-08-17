import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateCustomRoleDto, UpdateCustomRoleDto } from './dto/create-custom-role.dto';
export declare class CustomRolesService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    create(businessId: string, dto: CreateCustomRoleDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        capabilities: string[];
    }>;
    list(): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        capabilities: string[];
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        capabilities: string[];
    }>;
    update(id: string, dto: UpdateCustomRoleDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        capabilities: string[];
    }>;
    remove(id: string): Promise<void>;
    private assertKnownCapabilities;
}
