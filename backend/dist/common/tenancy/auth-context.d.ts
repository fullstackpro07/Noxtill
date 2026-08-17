import type { Request } from 'express';
import { Role } from '../../../generated/prisma';
import type { Capability } from '../capabilities/capabilities.constants';
export interface AuthenticatedUser {
    sub: string;
    businessId: string;
    role: Role;
    capabilities: Capability[];
    sessionId?: string;
}
export type RequestWithUser = Request & {
    user?: AuthenticatedUser;
};
