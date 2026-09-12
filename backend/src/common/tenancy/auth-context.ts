import type { Request } from 'express';
import { Role } from '@prisma/client';
import type { Capability } from '../capabilities/capabilities.constants';

/** Shape of `request.user` once JwtAuthGuard has verified the access token. */
export interface AuthenticatedUser {
  sub: string;
  businessId: string;
  role: Role;
  /** Resolved once at login/signup (UPD-BE-035) — see `AuthService.issueTokens`. Still the fast
   * path for a fixed system role; for a custom role, `CapabilitiesGuard` re-resolves live instead
   * of trusting this cached snapshot (UPD-INT-011) — see `customRoleId` below. */
  capabilities: Capability[];
  /** UPD-BE-040 — the real `Session` row this token belongs to. Optional so tokens issued before this ticket (and hand-built test fixtures) still type-check. */
  sessionId?: string;
  /** Staff depth fix (UPD-INT-011): present only when this user holds a custom role. Its presence
   * is what tells `CapabilitiesGuard` to do a real live DB lookup instead of trusting the JWT's
   * cached `capabilities` snapshot, so editing a custom role's capabilities takes effect on this
   * user's very next request rather than waiting up to the access token's TTL. Optional so tokens
   * issued before this ticket still type-check (they just keep using the cached fast path). */
  customRoleId?: string | null;
}

export type RequestWithUser = Request & { user?: AuthenticatedUser };
