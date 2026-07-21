import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { RequestWithUser } from '../tenancy/auth-context';
import { Role } from '../../../generated/prisma';

/**
 * Enforces per-route role gates (BE-008). Routes with no `@Roles(...)`
 * metadata are open to any authenticated role — per-record data filtering
 * (e.g. staff seeing only their own sales) is each service's responsibility,
 * not this guard's.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Ask the owner for access');
    }

    return true;
  }
}
