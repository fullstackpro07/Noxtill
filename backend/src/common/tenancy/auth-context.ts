import type { Request } from 'express';
import { Role } from '../../../generated/prisma';
import type { Capability } from '../capabilities/capabilities.constants';

/** Shape of `request.user` once JwtAuthGuard has verified the access token. */
export interface AuthenticatedUser {
  sub: string;
  businessId: string;
  role: Role;
  /** Resolved once at login/signup (UPD-BE-035) — see `AuthService.issueTokens`. */
  capabilities: Capability[];
}

export type RequestWithUser = Request & { user?: AuthenticatedUser };
