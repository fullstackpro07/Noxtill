import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REQUIRE_STEP_UP_KEY } from '../decorators/require-step-up.decorator';
import {
  ApiKeyAuthService,
  ApiKeyRateLimitedException,
} from '../../developer/api-key-auth.service';
import { API_KEY_PREFIX } from '../../developer/api-key.constants';
import type {
  AuthenticatedUser,
  RequestWithUser,
} from '../tenancy/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../filters/app.exception';
import {
  SessionsService,
  type SessionClaims,
} from '../../auth/sessions.service';
import {
  cookieName,
  csrfValid,
  readCookie,
} from '../../auth/security/auth-cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const STEP_UP_MS = 10 * 60_000;

/** Routes an unverified account may still use (spec §3.2: until verified it has no access to anything else). */
const UNVERIFIED_ALLOWED = [
  /^\/api\/v1\/auth\/(verification|verify-email|logout|session)(\/|$|\?)/,
  /^\/api\/v1\/users\/me(\/|$|\?)/,
];
/** Routes an owner without a second factor may use until they enrol one (spec §7.3). */
const MFA_SETUP_ALLOWED = [
  /^\/api\/v1\/auth\/(mfa|passkeys\/register|logout|session|verification|verify-email)(\/|$|\?)/,
  /^\/api\/v1\/users\/me(\/|$|\?)/,
];

/**
 * Global authentication guard (class name kept for the existing APP_GUARD wiring). Auth security
 * spec §8: sessions are opaque tokens — from the HttpOnly `nx_at` cookie for the browser app, or an
 * `Authorization: Bearer` opaque token for non-browser clients — resolved against the `sessions`
 * table on every request, so revocation is immediate. `Bearer ntk_…` developer API keys are
 * unchanged. Cookie-authenticated writes must carry the session's CSRF token (§9.1).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly sessions: SessionsService;

  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyAuth: ApiKeyAuthService,
    private readonly prisma: PrismaService,
  ) {
    this.sessions = new SessionsService(prisma);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<RequestWithUser & Request>();
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith(`Bearer ${API_KEY_PREFIX}`)) {
      return this.apiKey(context, request, authHeader.slice('Bearer '.length));
    }

    const fromCookie = readCookie(request, cookieName.access());
    const bearer = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;
    const token = fromCookie ?? bearer;
    if (!token) throw new UnauthorizedException('Not signed in');

    const resolved = await this.sessions.resolveAccess(token);
    if (!resolved) throw new UnauthorizedException('Not signed in');
    if (resolved.expired) {
      throw new AppException(
        'TOKEN_EXPIRED',
        'Session token expired',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const session = resolved.session;
    const path = request.originalUrl ?? request.url ?? '';

    if (fromCookie && !SAFE_METHODS.has(request.method.toUpperCase())) {
      const presented = request.headers['x-csrf-token'];
      if (
        !csrfValid(
          session.id,
          Array.isArray(presented) ? presented[0] : presented,
        )
      ) {
        throw new AppException(
          'CSRF_INVALID',
          'Security check failed. Reload the page and try again.',
          HttpStatus.FORBIDDEN,
        );
      }
    }
    if (
      session.user.email &&
      !session.user.emailVerifiedAt &&
      !UNVERIFIED_ALLOWED.some((r) => r.test(path))
    ) {
      throw new AppException(
        'EMAIL_NOT_VERIFIED',
        'Confirm your email address to continue.',
        HttpStatus.FORBIDDEN,
      );
    }
    if (
      session.mfaSetupRequired &&
      !MFA_SETUP_ALLOWED.some((r) => r.test(path))
    ) {
      throw new AppException(
        'MFA_SETUP_REQUIRED',
        'Set up an authenticator app or a passkey to continue.',
        HttpStatus.FORBIDDEN,
      );
    }

    const stepUp = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_STEP_UP_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      stepUp &&
      !(
        session.stepUpAt &&
        Date.now() - session.stepUpAt.getTime() <= STEP_UP_MS
      )
    ) {
      throw new AppException(
        'STEP_UP_REQUIRED',
        'Confirm it’s you to continue.',
        HttpStatus.FORBIDDEN,
      );
    }

    // Spec §9.3: removing someone (staff removal, People offboarding, revoked finance access,
    // branch deactivation) ends their access at that moment — whichever module did the removal.
    const membership = await this.prisma.businessUser.findFirst({
      where: {
        userId: session.userId,
        businessId: session.businessId,
        active: true,
        business: { active: true },
      },
      select: { id: true },
    });
    if (!membership) {
      await this.sessions.revoke(session.id, 'access_removed');
      throw new AppException(
        'ACCESS_REMOVED',
        'Your access to this business has ended.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const claims = (session.claims ?? {}) as Partial<SessionClaims>;
    request.user = {
      sub: session.userId,
      businessId: session.businessId,
      role: claims.role,
      capabilities: claims.capabilities ?? [],
      sessionId: session.id,
      customRoleId: claims.customRoleId ?? undefined,
    } as AuthenticatedUser;
    return true;
  }

  private async apiKey(
    context: ExecutionContext,
    request: RequestWithUser,
    rawKey: string,
  ) {
    let user: AuthenticatedUser | null;
    try {
      user = await this.apiKeyAuth.authenticate(rawKey);
    } catch (error) {
      if (error instanceof ApiKeyRateLimitedException) {
        context
          .switchToHttp()
          .getResponse<Response>()
          .setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
    if (!user) throw new UnauthorizedException('Invalid or revoked API key');
    request.user = user;
    return true;
  }
}
