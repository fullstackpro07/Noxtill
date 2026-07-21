import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_ROLE,
  CLS_KEY_USER_ID,
} from './tenant.constants';
import type { RequestWithUser } from './auth-context';

/**
 * Binds the authenticated user's businessId/userId/role into CLS so
 * TenantPrismaService can auto-scope every query for the rest of the
 * request lifecycle. Must run AFTER JwtAuthGuard (which populates
 * request.user) — order matters in the global APP_GUARD array.
 *
 * Always returns true: this guard only threads context, it never denies
 * access. Routes with no authenticated user (public endpoints) simply run
 * without tenant scoping bound, which is correct — those handlers must
 * resolve their own business by slug/token and query explicitly.
 */
@Injectable()
export class TenancyGuard implements CanActivate {
  constructor(private readonly cls: ClsService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (user) {
      this.cls.set(CLS_KEY_BUSINESS_ID, user.businessId);
      this.cls.set(CLS_KEY_USER_ID, user.sub);
      this.cls.set(CLS_KEY_ROLE, user.role);
    }

    return true;
  }
}
