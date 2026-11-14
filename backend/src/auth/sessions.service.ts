import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { SecurityEventsService } from '../common/security/security-events.service';
import { AppException } from '../common/filters/app.exception';
import { PrismaService } from '../prisma/prisma.service';

/** Auth security spec §8.1 / §8.5. */
export const ACCESS_TTL_MS = 15 * 60_000;
const PERSONAL = { idleMs: 7 * 24 * 3600_000, absoluteMs: 30 * 24 * 3600_000 };
const SHARED = { idleMs: 15 * 60_000, absoluteMs: 12 * 3600_000 };
/** A just-rotated refresh token presented again within this window is a parallel-tab race, not theft. */
const ROTATION_RACE_MS = 10_000;

export const sha256 = (v: string) =>
  createHash('sha256').update(v).digest('hex');
const opaque = () => randomBytes(32).toString('base64url');

export interface SessionClaims {
  role: string;
  customRoleId: string | null;
  capabilities: string[];
}

export interface IssuedTokens {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  accessMaxAgeMs: number;
  refreshMaxAgeMs: number;
}

export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
  country?: string;
}

/**
 * Sessions with opaque tokens (spec §8). Access tokens (32 random bytes, 15 min) and refresh tokens
 * (32 random bytes, rotating, ≤30 days) are stored only as SHA-256 hashes. Every refresh token of a
 * session is one family: presenting an already-consumed token is treated as theft — the family and
 * every session of that user are revoked (§8.3).
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  /** Called when a refresh token is reused — wired by AuthModule to email the owner. */
  onReuseDetected?: (userId: string) => Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly securityEvents?: SecurityEventsService,
  ) {}

  private policy(shared: boolean) {
    return shared ? SHARED : PERSONAL;
  }

  /** A brand-new session id on every sign-in — never a promoted pre-auth session (§8.4). */
  async create(
    userId: string,
    businessId: string,
    claims: SessionClaims,
    meta: SessionMeta,
    opts: {
      shared?: boolean;
      method?: string;
      mfaSetupRequired?: boolean;
    } = {},
  ): Promise<IssuedTokens> {
    const shared = !!opts.shared;
    const { absoluteMs } = this.policy(shared);
    const accessToken = opaque();
    const refreshToken = opaque();
    const now = Date.now();
    const absoluteExpiresAt = new Date(now + absoluteMs);
    const session = await this.prisma.session.create({
      data: {
        userId,
        businessId,
        refreshTokenHash: '',
        userAgent: meta.userAgent?.slice(0, 500),
        ipAddress: meta.ipAddress,
        country: meta.country,
        accessTokenHash: sha256(accessToken),
        accessExpiresAt: new Date(now + ACCESS_TTL_MS),
        claims: claims as unknown as Prisma.InputJsonValue,
        sharedDevice: shared,
        absoluteExpiresAt,
        method: opts.method,
        mfaSetupRequired: !!opts.mfaSetupRequired,
        refreshTokens: {
          create: {
            tokenHash: sha256(refreshToken),
            expiresAt: absoluteExpiresAt,
          },
        },
      },
    });
    return {
      sessionId: session.id,
      accessToken,
      refreshToken,
      accessMaxAgeMs: ACCESS_TTL_MS,
      refreshMaxAgeMs: absoluteMs,
    };
  }

  /**
   * Resolves an access token to its live session (null when unknown, expired, revoked, idle or past
   * its absolute lifetime — idle/absolute expiry also revokes the row).
   */
  async resolveAccess(accessToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { accessTokenHash: sha256(accessToken) },
      include: {
        user: {
          select: { emailVerifiedAt: true, email: true, platformStatus: true },
        },
      },
    });
    if (!session || session.revokedAt) return null;
    const now = Date.now();
    if (!session.accessExpiresAt || session.accessExpiresAt.getTime() <= now) {
      return { expired: true as const };
    }
    if (this.timedOut(session, now)) {
      await this.revoke(session.id, 'timeout');
      return null;
    }
    // Idle clock: touch at most once a minute.
    if (now - session.lastUsedAt.getTime() > 60_000) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date(now) },
      });
    }
    return { expired: false as const, session };
  }

  private timedOut(
    s: {
      sharedDevice: boolean;
      lastUsedAt: Date;
      absoluteExpiresAt: Date | null;
    },
    now: number,
  ) {
    const { idleMs } = this.policy(s.sharedDevice);
    if (s.absoluteExpiresAt && s.absoluteExpiresAt.getTime() <= now)
      return true;
    return now - s.lastUsedAt.getTime() > idleMs;
  }

  /**
   * Rotation with reuse detection (§8.3). Returns new tokens, or throws. `recompute` refreshes the
   * role/capability claims so permission changes apply at the next refresh.
   */
  async rotate(
    refreshToken: string,
    recompute: (session: {
      userId: string;
      businessId: string;
    }) => Promise<SessionClaims>,
  ): Promise<IssuedTokens & { userId: string }> {
    const invalid = () =>
      new AppException(
        'INVALID_REFRESH',
        'Your session has ended. Please sign in again.',
        HttpStatus.UNAUTHORIZED,
      );
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { session: true },
    });
    if (!row) throw invalid();
    // An already-ended family (logout, revocation, earlier reuse) is simply rejected.
    if (row.session.revokedAt) throw invalid();
    if (row.consumedAt) {
      if (Date.now() - row.consumedAt.getTime() <= ROTATION_RACE_MS) {
        // Another tab rotated this family a moment ago; its new cookies are already in the jar.
        throw invalid();
      }
      await this.handleReuse(row.session.userId, row.sessionId);
      throw invalid();
    }
    const session = row.session;
    const now = Date.now();
    if (
      session.revokedAt ||
      row.expiresAt.getTime() <= now ||
      this.timedOut(session, now)
    ) {
      if (!session.revokedAt) await this.revoke(session.id, 'timeout');
      throw invalid();
    }
    const consumed = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date(now) },
    });
    if (consumed.count === 0) throw invalid();

    const claims = await recompute(session);
    const accessToken = opaque();
    const nextRefresh = opaque();
    const refreshExpiry =
      session.absoluteExpiresAt ?? new Date(now + PERSONAL.absoluteMs);
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        accessTokenHash: sha256(accessToken),
        accessExpiresAt: new Date(now + ACCESS_TTL_MS),
        claims: claims as unknown as Prisma.InputJsonValue,
        lastUsedAt: new Date(now),
        refreshTokens: {
          create: { tokenHash: sha256(nextRefresh), expiresAt: refreshExpiry },
        },
      },
    });
    return {
      userId: session.userId,
      sessionId: session.id,
      accessToken,
      refreshToken: nextRefresh,
      accessMaxAgeMs: ACCESS_TTL_MS,
      refreshMaxAgeMs: Math.max(0, refreshExpiry.getTime() - now),
    };
  }

  private async handleReuse(userId: string, sessionId: string) {
    this.logger.warn(
      `Refresh token reuse detected for session ${sessionId.slice(0, 8)}…`,
    );
    await this.revokeAllForUser(userId, 'refresh_reuse');
    await this.securityEvents?.record({
      type: 'refresh_reuse_detected',
      userId,
      metadata: { sessionId },
    });
    await this.onReuseDetected?.(userId).catch(() => undefined);
  }

  findActive(sessionId: string) {
    return this.prisma.session.findFirst({
      where: { id: sessionId, revokedAt: null },
    });
  }

  /** Ends one session: its access token and its whole refresh family stop working immediately. */
  async revoke(sessionId: string, reason = 'logout') {
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date(), accessTokenHash: null },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
    ]);
    void reason;
  }

  /**
   * Mandatory revocation (§9.3): password change/reset, email change, sign-in method removed, refresh
   * reuse, passkey counter regression, suspension/lock, staff removal. Optionally scoped to one
   * business (staff removal) and/or sparing the caller's own session.
   */
  async revokeAllForUser(
    userId: string,
    reason: string,
    opts: { businessId?: string; exceptSessionId?: string } = {},
  ): Promise<number> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(opts.businessId ? { businessId: opts.businessId } : {}),
        ...(opts.exceptSessionId ? { id: { not: opts.exceptSessionId } } : {}),
      },
      select: { id: true },
    });
    const ids = sessions.map((s) => s.id);
    if (!ids.length) return 0;
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: { in: ids } },
        data: { revokedAt: new Date(), accessTokenHash: null },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId: { in: ids }, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
    ]);
    await this.securityEvents?.record({
      type: 'session_revoked',
      userId,
      metadata: {
        reason,
        count: ids.length,
        ...(opts.businessId ? { businessId: opts.businessId } : {}),
      },
    });
    return ids.length;
  }

  async markStepUp(sessionId: string) {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { stepUpAt: new Date() },
    });
  }

  async clearMfaSetupRequired(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, mfaSetupRequired: true },
      data: { mfaSetupRequired: false },
    });
  }

  /** Device list (§9.2): never returns token hashes. */
  async list(userId: string, currentSessionId?: string) {
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        businessId: true,
        userAgent: true,
        ipAddress: true,
        country: true,
        sharedDevice: true,
        method: true,
        createdAt: true,
        lastUsedAt: true,
        absoluteExpiresAt: true,
      },
    });
    return rows.map((r) => ({ ...r, current: r.id === currentSessionId }));
  }

  /** Only the session's own owner may revoke it — never trusts a bare id from another user. */
  async revokeOwn(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }
    await this.revoke(sessionId, 'self');
    await this.securityEvents?.record({
      type: 'session_revoked',
      userId,
      businessId: session.businessId,
      metadata: { sessionId, by: 'self' },
    });
  }
}
