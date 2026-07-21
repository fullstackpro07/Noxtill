import type { Request } from 'express';
import { Role } from '../../../generated/prisma';
export interface AuthenticatedUser {
    sub: string;
    businessId: string;
    role: Role;
}
export type RequestWithUser = Request & {
    user?: AuthenticatedUser;
};
