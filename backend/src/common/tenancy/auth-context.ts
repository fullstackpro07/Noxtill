import type { Request } from 'express';
import { Role } from '../../../generated/prisma';

/** Shape of `request.user` once JwtAuthGuard has verified the access token. */
export interface AuthenticatedUser {
  sub: string;
  businessId: string;
  role: Role;
}

export type RequestWithUser = Request & { user?: AuthenticatedUser };
