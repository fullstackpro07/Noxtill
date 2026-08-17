import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateCustomRoleDto, UpdateCustomRoleDto } from './dto/create-custom-role.dto';
export declare class CustomRolesService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    create(businessId: string, dto: CreateCustomRoleDto): Promise<{
        name: string;
        id: string;
        businessId: string;
        capabilities: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    list(): import("generated/prisma/runtime/library").PrismaPromise<{
        name: string;
        id: string;
        businessId: string;
        capabilities: string[];
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    findOne(id: string): Promise<{
        name: string;
        id: string;
        businessId: string;
        capabilities: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(id: string, dto: UpdateCustomRoleDto): Promise<{
        name: string;
        id: string;
        businessId: string;
        capabilities: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(id: string): Promise<void>;
    private assertKnownCapabilities;
}
