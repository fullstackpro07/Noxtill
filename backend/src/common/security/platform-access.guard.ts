import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../filters/app.exception';
import type { RequestWithUser } from '../tenancy/auth-context';
import { API_KEY_SUBJECT_PREFIX } from '../../developer/api-key.constants';

export const PLATFORM_ACCESS_ERROR_CODES = {
  SESSION_REVOKED: 'SESSION_REVOKED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  BUSINESS_SUSPENDED: 'BUSINESS_SUSPENDED',
} as const;

type Verdict = 'ok' | 'session_revoked' | 'user_suspended' | 'business_blocked';

const CACHE_MS = 10_000;
const cache = new Map<string, { at: number; verdict: Verdict }>();

/** Drops cached verdicts so a Super Admin suspension/revocation applies on the very next request. */
export function invalidatePlatformAccessCache(): void {
  cache.clear();
}

/**
 * Super Admin enforcement on every authenticated tenant request (PRD §5.3/§11.3): a JWT is only
 * checked for signature + expiry, so without this a revoked session or a platform-suspended
 * user/business would keep working until the access token expired (`JWT_ACCESS_TTL`, 15m).
 *
 * Runs right after JwtAuthGuard. Checks (10s cache, cleared on every admin change in-process):
 *  - the token's `Session` row is not revoked,
 *  - the user is not platform-suspended,
 *  - the branch group's root business is not platform-suspended or archived.
 * Logout stays reachable so a blocked user can still sign out cleanly.
 * Fails OPEN on a lookup error, same as `SubscriptionStateGuard` — a database outage already
 * fails the real request, and this guard must never be the thing that locks everyone out.
 */
@Injectable()
export class PlatformAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const user = req.user;
    if (!user?.businessId) return true;
    const path = req.originalUrl ?? req.url ?? '';
    if (/\/api\/v1\/auth\/logout(\/|$|\?)/.test(path)) return true;

    const key = `${user.sub}|${user.sessionId ?? ''}|${user.businessId}`;
    let entry = cache.get(key);
    if (!entry || Date.now() - entry.at > CACHE_MS) {
      try {
        entry = { at: Date.now(), verdict: await this.check(user) };
        cache.set(key, entry);
      } catch {
        return true;
      }
    }

    switch (entry.verdict) {
      case 'ok':
        return true;
      case 'session_revoked':
        throw new UnauthorizedException({
          code: PLATFORM_ACCESS_ERROR_CODES.SESSION_REVOKED,
          message: 'This session was signed out. Please sign in again.',
        });
      case 'user_suspended':
        throw new AppException(
          PLATFORM_ACCESS_ERROR_CODES.ACCOUNT_SUSPENDED,
          'This account has been suspended by Noxtill. Contact Noxtill support.',
          HttpStatus.FORBIDDEN,
        );
      default:
        throw new AppException(
          PLATFORM_ACCESS_ERROR_CODES.BUSINESS_SUSPENDED,
          'This business account has been suspended by Noxtill. Contact Noxtill support.',
          HttpStatus.FORBIDDEN,
        );
    }
  }

  private async check(user: {
    sub: string;
    sessionId?: string;
    businessId: string;
  }): Promise<Verdict> {
    const business = await this.prisma.business.findUnique({
      where: { id: user.businessId },
      select: {
        platformStatus: true,
        parent: { select: { platformStatus: true } },
      },
    });
    const rootStatus =
      business?.parent?.platformStatus ?? business?.platformStatus;
    if (
      (business?.platformStatus && business.platformStatus !== 'active') ||
      (rootStatus && rootStatus !== 'active')
    ) {
      return 'business_blocked';
    }
    if (user.sub.startsWith(API_KEY_SUBJECT_PREFIX)) return 'ok';

    if (user.sessionId) {
      const session = await this.prisma.session.findUnique({
        where: { id: user.sessionId },
        select: { revokedAt: true },
      });
      if (session?.revokedAt) return 'session_revoked';
    }
    const person = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { platformStatus: true },
    });
    if (person && person.platformStatus !== 'active') return 'user_suspended';
    return 'ok';
  }
}
