import { CustomRolesService } from './custom-roles.service';
import { CreateCustomRoleDto, UpdateCustomRoleDto } from './dto/create-custom-role.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class CustomRolesController {
    private readonly customRoles;
    constructor(customRoles: CustomRolesService);
    listCapabilities(): import("../common/capabilities/capabilities.constants").Capability[];
    create(user: AuthenticatedUser, dto: CreateCustomRoleDto): Promise<{
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
}
