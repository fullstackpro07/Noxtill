import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { CAPABILITY_KEY } from '../decorators/require-capability.decorator';
import type { Capability } from '../capabilities/capabilities.constants';
import type { RequestWithUser } from '../tenancy/auth-context';
import { CapabilitiesService } from '../capabilities/capabilities.service';

/**
 * Enforces per-route capability gates (UPD-BE-035) — replaces the old flat-role `RolesGuard`.
 * Routes with no `@RequireCapability(...)` metadata are open to any authenticated role, same
 * default as before. For a caller on the `owner` role, the capability set is always the full,
 * hardcoded superset and can never be overridden (see `CapabilitiesService.resolve`), so that
 * case alone stays the original zero-I/O fast path, trusting the JWT snapshot.
 *
 * Staff depth fix (UPD-INT-011, extended by UPD-BE-STAFF-01): a caller holding a *custom* role,
 * or a *manager/staff* system role a `RoleCapabilityOverride` might apply to, is a case whose
 * capabilities really can change out from under an already-issued token (an owner editing that
 * role in `CustomRolesService`, or editing the Manager/Staff matrix on the Roles & Permissions
 * screen), so for those cases this guard re-resolves live via `CapabilitiesService.resolve` (the
 * exact same method `AuthService.issueTokens` already uses) instead of trusting the cached JWT
 * snapshot — a real edit now takes effect on the very next request, not after a token refresh.
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

    if (user.customRoleId || user.role !== Role.owner) {
      return this.capabilities
        .resolve({
          businessId: user.businessId,
          role: user.role,
          customRoleId: user.customRoleId ?? null,
        })
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
