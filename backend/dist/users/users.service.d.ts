import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class UsersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    me(authUser: AuthenticatedUser): Promise<{
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
