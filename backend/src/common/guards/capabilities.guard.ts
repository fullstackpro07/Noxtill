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

/**
 * Enforces per-route capability gates (UPD-BE-035) — replaces the old flat-role `RolesGuard`.
 * Routes with no `@RequireCapability(...)` metadata are open to any authenticated role, same
 * default as before. The caller's capability set was resolved once at login/signup (baked into
 * the JWT — see `AuthService.issueTokens`), so this guard does zero I/O, same as the guard it
 * replaces.
 */
@Injectable()
export class CapabilitiesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredCapability = this.reflector.getAllAndOverride<Capability>(
      CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredCapability) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user || !user.capabilities.includes(requiredCapability)) {
      throw new ForbiddenException('Ask the owner for access');
    }

    return true;
  }
}
