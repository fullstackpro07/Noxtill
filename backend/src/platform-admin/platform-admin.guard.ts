import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Platform-admin endpoints (BE-072) sit outside the per-business RBAC
 * model entirely (owner/manager/staff, BE-008) — there's no "platform
 * admin" business role, so this is a separate shared-secret gate rather
 * than reusing CapabilitiesGuard. Requires `x-admin-key` to match
 * PLATFORM_ADMIN_KEY; if that env var isn't set, every request is refused
 * (fail closed, never fail open on a missing secret).
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expected = this.config.get<string>('PLATFORM_ADMIN_KEY');
    const provided = request.headers['x-admin-key'];

    if (!expected || provided !== expected) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
