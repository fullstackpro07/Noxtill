import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CAPABILITY_KEY } from '../decorators/require-capability.decorator';
import type { Capability } from '../capabilities/capabilities.constants';
import type { RequestWithUser } from '../tenancy/auth-context';
import { CapabilitiesService } from '../capabilities/capabilities.service';

/**
 * Enforces per-route capability gates (UPD-BE-035) — replaces the old flat-role `RolesGuard`.
 * Routes with no `@RequireCapability(...)` metadata are open to any authenticated role, same
 * default as before. For a caller on a fixed system role, the capability set was resolved once at
 * login/signup (baked into the JWT — see `AuthService.issueTokens`), so this stays zero-I/O, same
 * as the guard it replaces — a fixed role's capabilities are hardcoded and never change live.
 *
 * Staff depth fix (UPD-INT-011): a caller holding a *custom* role is the one case whose
 * capabilities really can change out from under an already-issued token (an owner editing that
 * role in `CustomRolesService`), so for that case only, this guard re-resolves live from the
 * current `CustomRole` row via `CapabilitiesService.resolve` (the exact same method
 * `AuthService.issueTokens` already uses) instead of trusting the cached JWT snapshot — a real
 * edit now takes effect on the very next request, not after a token refresh. This intentionally
 * does not add I/O for the common fixed-role case.
 */
@Injectable()
export class CapabilitiesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly capabilities: CapabilitiesService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const requiredCapability = this.reflector.getAllAndOverride<Capability>(
      CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredCapability) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Ask the owner for access');
    }

    if (user.customRoleId) {
      return this.capabilities
        .resolve({ role: user.role, customRoleId: user.customRoleId })
        .then((liveCapabilities) => {
          if (!liveCapabilities.includes(requiredCapability)) {
            throw new ForbiddenException('Ask the owner for access');
          }
          return true;
        });
    }

    if (!user.capabilities.includes(requiredCapability)) {
      throw new ForbiddenException('Ask the owner for access');
    }

    return true;
  }
}
