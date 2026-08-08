import { UsersService } from './users.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    me(user: AuthenticatedUser): Promise<{
        user: {
            role: import("generated/prisma").$Enums.Role;
            businessUserId: string | null;
            id: string;
            email: string | null;
            phone: string | null;
            name: string;
        };
        business: {
            id: string;
            name: string;
            slug: string;
            currency: string;
            timezone: string;
            locale: string;
            country: string | null;
            branches: {
                id: string;
                name: string;
            }[];
            parentId: string | null;
        };
    }>;
}
