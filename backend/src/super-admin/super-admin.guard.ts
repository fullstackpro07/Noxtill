import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SecurityEventsService } from '../common/security/security-events.service';
import {
  ADMIN_OPEN_KEY,
  ADMIN_PERMISSION_KEY,
  ADMIN_REAUTH_KEY,
  AdminRequest,
} from './super-admin.decorators';
import {
  AdminPermission,
  SUPER_ADMIN_ERROR_CODES,
} from './super-admin.constants';
import { AdminAuthService } from './services/admin-auth.service';

const TOUCH_EVERY_MS = 60_000;

/**
 * The only gate on `/super-admin/*` routes (they are all `@Public()` for the tenant pipeline, the
 * same pattern as the legacy `platform-admin` controller). Every request — no cache, so a
 * revocation or a permission change applies immediately:
 *  1. verifies the admin access token (its own secret: a tenant token can never pass, nor the reverse),
 *  2. loads the session (not revoked, not past its absolute expiry) and the admin (active, TOTP enrolled),
 *  3. enforces `@AdminPermission(...)` against the admin's role,
 *  4. enforces `@RequireReauth()` — a fresh, never-before-used TOTP code in the body.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly auth: AdminAuthService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ADMIN_OPEN_KEY, targets))
      return true;

    const req = context.switchToHttp().getRequest<AdminRequest>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    let payload: { sub: string; sid: string; typ: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.auth.accessSecret(),
      });
    } catch {
      throw this.unauthorized();
    }
    if (payload.typ !== 'admin_access') throw this.unauthorized();

    const session = await this.prisma.platformAdminSession.findUnique({
      where: { id: payload.sid },
      include: { admin: { include: { role: true } } },
    });
    const now = new Date();
    if (
      !session ||
      session.adminId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.admin.status !== 'active' ||
      !session.admin.totpEnabledAt
    ) {
      throw this.unauthorized();
    }
    if (now.getTime() - session.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
      await this.prisma.platformAdminSession.update({
        where: { id: session.id },
        data: { lastUsedAt: now },
      });
    }

    const permissions = this.auth.permissionsFor(session.admin.role);
    req.admin = {
      id: session.admin.id,
      email: session.admin.email,
      name: session.admin.name,
      roleKey: session.admin.roleKey,
      permissions,
      sessionId: session.id,
    };

    const required = this.reflector.getAllAndOverride<AdminPermission>(
      ADMIN_PERMISSION_KEY,
      targets,
    );
    if (required && !permissions.includes(required)) {
      throw new AppException(
        SUPER_ADMIN_ERROR_CODES.FORBIDDEN,
        `Your admin role does not include "${required}".`,
        HttpStatus.FORBIDDEN,
      );
    }

    if (this.reflector.getAllAndOverride<boolean>(ADMIN_REAUTH_KEY, targets)) {
      const code = (req.body as { totpCode?: unknown } | undefined)?.totpCode;
      if (typeof code !== 'string' || !code) {
        throw new AppException(
          SUPER_ADMIN_ERROR_CODES.REAUTH_REQUIRED,
          'Confirm this action with a code from your authenticator app.',
          HttpStatus.UNAUTHORIZED,
        );
      }
      const ok = await this.auth.consumeTotp(session.admin, code);
      if (!ok) {
        await this.securityEvents.record({
          type: 'admin_totp_failed',
          adminId: session.admin.id,
          identifier: session.admin.email,
          ipAddress: req.ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
          metadata: { stage: 'reauth', path: req.originalUrl },
        });
        throw new AppException(
          SUPER_ADMIN_ERROR_CODES.TOTP_INVALID,
          'That authenticator code is not valid (or was already used). Try the next code.',
          HttpStatus.UNAUTHORIZED,
        );
      }
    }
    return true;
  }

  private unauthorized() {
    return new AppException(
      SUPER_ADMIN_ERROR_CODES.SESSION_INVALID,
      'Your admin session has ended. Sign in again.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
