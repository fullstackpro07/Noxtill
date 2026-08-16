import type { Request } from 'express';
import { Role } from '../../../generated/prisma';
import type { Capability } from '../capabilities/capabilities.constants';
export interface AuthenticatedUser {
    sub: string;
    businessId: string;
    role: Role;
    capabilities: Capability[];
}
export type RequestWithUser = Request & {
    user?: AuthenticatedUser;
};
