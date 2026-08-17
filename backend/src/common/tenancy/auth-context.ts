import type { Request } from 'express';
import { Role } from '@prisma/client';
import type { Capability } from '../capabilities/capabilities.constants';

/** Shape of `request.user` once JwtAuthGuard has verified the access token. */
export interface AuthenticatedUser {
  sub: string;
  businessId: string;
  role: Role;
  /** Resolved once at login/signup (UPD-BE-035) — see `AuthService.issueTokens`. */
  capabilities: Capability[];
  /** UPD-BE-040 — the real `Session` row this token belongs to. Optional so tokens issued before this ticket (and hand-built test fixtures) still type-check. */
  sessionId?: string;
}

export type RequestWithUser = Request & { user?: AuthenticatedUser };
