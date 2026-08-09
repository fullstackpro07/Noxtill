import { UsersService } from './users.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    me(user: AuthenticatedUser): Promise<{
        user: {
            role: import("generated/prisma").$Enums.Role;
            businessUserId: string | null;
            name: string;
            email: string | null;
            phone: string | null;
            id: string;
        };
        business: {
            name: string;
            country: string | null;
            currency: string;
            locale: string;
            id: string;
            slug: string;
            timezone: string;
            branches: {
                name: string;
                id: string;
            }[];
            parentId: string | null;
        };
    }>;
}
