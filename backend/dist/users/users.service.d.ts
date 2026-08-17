import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class UsersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    me(authUser: AuthenticatedUser): Promise<{
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
            parentId: string | null;
            branches: {
                name: string;
                id: string;
            }[];
        };
    }>;
}
