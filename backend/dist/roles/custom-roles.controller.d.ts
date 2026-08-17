import { CustomRolesService } from './custom-roles.service';
import { CreateCustomRoleDto, UpdateCustomRoleDto } from './dto/create-custom-role.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class CustomRolesController {
    private readonly customRoles;
    constructor(customRoles: CustomRolesService);
    listCapabilities(): import("../common/capabilities/capabilities.constants").Capability[];
    create(user: AuthenticatedUser, dto: CreateCustomRoleDto): Promise<{
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
}
