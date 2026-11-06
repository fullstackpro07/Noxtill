import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { PlatformAdmin, PlatformAdminRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/filters/app.exception';
import { SecurityEventsService } from '../../common/security/security-events.service';
import { AdminSecretCipherService } from '../admin-secret-cipher.service';
import {
  ADMIN_ACCESS_TTL,
  ADMIN_CHALLENGE_TTL,
  ADMIN_IDLE_MINUTES,
  ADMIN_LOCK_MINUTES,
  ADMIN_MAX_LOGIN_ATTEMPTS,
  ADMIN_SESSION_MAX_HOURS,
  ALL_ADMIN_PERMISSIONS,
  AdminPermission,
  SUPER_ADMIN_ERROR_CODES,
  SUPER_ADMIN_ROLE,
  TOTP_ISSUER,
} from '../super-admin.constants';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../totp.util';

export interface AdminMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type AdminLoginStage =
  | { stage: 'totp'; challengeToken: string }
  | {
      stage: 'enroll';
      challengeToken: string;
      otpauthUrl: string;
      secret: string;
    };

export interface AdminTokens {
  accessToken: string;
  refreshToken: string;
  admin: AdminProfile;
}

export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  permissions: AdminPermission[];
  lastLoginAt: string | null;
}

const BCRYPT_ROUNDS = 12;

/**
 * Super Admin identity (separate from tenant `User` accounts — PRD §1.2/§6). Password + mandatory
 * TOTP on every login (PRD §22.1); TOTP enrollment is forced at first login. Tokens are signed with
 * secrets derived from `JWT_SECRET` but distinct from it, so tenant and admin tokens never cross.
 */
@Injectable()
export class AdminAuthService {
  private dummyHash?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly cipher: AdminSecretCipherService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  private base(): string {
    const s = this.config.get<string>('JWT_SECRET');
    if (!s) throw new Error('JWT_SECRET is not configured');
    return s;
  }
  accessSecret() {
    return `${this.base()}:super-admin`;
  }
  private refreshSecret() {
    return `${this.base()}:super-admin-refresh`;
  }
  private challengeSecret() {
    return `${this.base()}:super-admin-challenge`;
  }

  permissionsFor(role: Pick<PlatformAdminRole, 'key' | 'permissions'>) {
    if (role.key === SUPER_ADMIN_ROLE) return [...ALL_ADMIN_PERMISSIONS];
    const raw = Array.isArray(role.permissions) ? role.permissions : [];
    return ALL_ADMIN_PERMISSIONS.filter((p) => raw.includes(p));
  }

  hashPassword(password: string) {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /** 12+ chars with upper, lower, digit — stronger than tenant rules (most privileged accounts). */
  passwordRuleError(password: string): string | null {
    if (typeof password !== 'string' || password.length < 12)
      return 'Admin passwords need at least 12 characters.';
    if (
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    )
      return 'Admin passwords need an upper-case letter, a lower-case letter and a number.';
    return null;
  }

  async login(
    email: string,
    password: string,
    meta: AdminMeta,
  ): Promise<AdminLoginStage> {
    const normalized = (email ?? '').trim().toLowerCase();
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: normalized },
    });
    const evt = {
      identifier: normalized,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    };
    if (!admin) {
      // Same work as a real check, so timing doesn't reveal which emails are admins.
      this.dummyHash ??= await bcrypt.hash(
        'noxtill-no-such-admin',
        BCRYPT_ROUNDS,
      );
      await bcrypt.compare(password ?? '', this.dummyHash);
      await this.securityEvents.record({ ...evt, type: 'admin_login_failed' });
      throw this.invalid();
    }
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      await this.securityEvents.record({
        ...evt,
        type: 'admin_login_failed',
        adminId: admin.id,
        metadata: { reason: 'locked' },
      });
      throw new AppException(
        SUPER_ADMIN_ERROR_CODES.LOCKED,
        `Too many failed attempts. Try again after ${admin.lockedUntil.toISOString()}.`,
        HttpStatus.FORBIDDEN,
      );
    }
    const valid = await bcrypt.compare(password ?? '', admin.passwordHash);
    if (!valid) {
      const attempts = admin.failedLoginAttempts + 1;
      const lock = attempts >= ADMIN_MAX_LOGIN_ATTEMPTS;
      await this.prisma.platformAdmin.update({
        where: { id: admin.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: lock
            ? new Date(Date.now() + ADMIN_LOCK_MINUTES * 60_000)
            : undefined,
        },
      });
      await this.securityEvents.record({
        ...evt,
        type: lock ? 'admin_locked' : 'admin_login_failed',
        adminId: admin.id,
        metadata: { attempts },
      });
      throw this.invalid();
    }
    if (admin.status !== 'active') {
      await this.securityEvents.record({
        ...evt,
        type: 'admin_login_failed',
        adminId: admin.id,
        metadata: { reason: 'disabled' },
      });
      throw new AppException(
        SUPER_ADMIN_ERROR_CODES.DISABLED,
        'This admin account is disabled.',
        HttpStatus.FORBIDDEN,
      );
    }

    if (!admin.totpEnabledAt) {
      const secret = generateTotpSecret();
      await this.prisma.platformAdmin.update({
        where: { id: admin.id },
        data: { totpSecret: this.cipher.encrypt(secret) },
      });
      return {
        stage: 'enroll',
        challengeToken: await this.challenge(admin.id, 'enroll'),
        otpauthUrl: otpauthUrl(secret, admin.email, TOTP_ISSUER),
        secret,
      };
    }
    return {
      stage: 'totp',
      challengeToken: await this.challenge(admin.id, 'totp'),
    };
  }

  /** Completes a login (stage `totp`) or a first-time enrollment (stage `enroll`). */
  async completeLogin(
    challengeToken: string,
    code: string,
    meta: AdminMeta,
  ): Promise<AdminTokens> {
    let payload: { sub: string; typ: string; stage: 'totp' | 'enroll' };
    try {
      payload = await this.jwt.verifyAsync(challengeToken, {
        secret: this.challengeSecret(),
      });
    } catch {
      throw new AppException(
        SUPER_ADMIN_ERROR_CODES.SESSION_INVALID,
        'This sign-in attempt expired. Start again.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (payload.typ !== 'admin_challenge') throw this.invalid();
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({
      where: { id: payload.sub },
    });
    if (admin.status !== 'active') throw this.invalid();
    if (payload.stage === 'totp' && !admin.totpEnabledAt) throw this.invalid();

    const ok = await this.consumeTotp(admin, code);
    if (!ok) {
      const attempts = admin.failedLoginAttempts + 1;
      const lock = attempts >= ADMIN_MAX_LOGIN_ATTEMPTS;
      await this.prisma.platformAdmin.update({
        where: { id: admin.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: lock
            ? new Date(Date.now() + ADMIN_LOCK_MINUTES * 60_000)
            : undefined,
        },
      });
      await this.securityEvents.record({
        type: lock ? 'admin_locked' : 'admin_totp_failed',
        adminId: admin.id,
        identifier: admin.email,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
        metadata: { stage: payload.stage },
      });
      throw new AppException(
        SUPER_ADMIN_ERROR_CODES.TOTP_INVALID,
        'That authenticator code is not valid. Check the time on your phone and try the next code.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        totpEnabledAt: admin.totpEnabledAt ?? new Date(),
      },
    });
    if (!admin.totpEnabledAt) {
      await this.securityEvents.record({
        type: 'admin_totp_enrolled',
        adminId: admin.id,
        identifier: admin.email,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      });
    }
    await this.securityEvents.record({
      type: 'admin_login_success',
      adminId: admin.id,
      identifier: admin.email,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    });
    return this.issue(admin.id, meta);
  }

  /**
   * Verifies a TOTP code and burns its time-step atomically, so the same code can never be used
   * twice (not even by two concurrent requests).
   */
  async consumeTotp(admin: PlatformAdmin, code: string): Promise<boolean> {
    if (!admin.totpSecret) return false;
    let secret: string;
    try {
      secret = this.cipher.decrypt(admin.totpSecret);
    } catch {
      return false;
    }
    const step = verifyTotp(secret, code);
    if (step == null) return false;
    const burned = await this.prisma.platformAdmin.updateMany({
      where: {
        id: admin.id,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
      },
      data: { totpLastStep: step },
    });
    return burned.count === 1;
  }

  async refresh(refreshToken: string, meta: AdminMeta): Promise<AdminTokens> {
    let payload: { sub: string; sid: string; typ: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.refreshSecret(),
      });
    } catch {
      throw this.sessionEnded();
    }
    const session = await this.prisma.platformAdminSession.findUnique({
      where: { id: payload.sid },
      include: { admin: true },
    });
    const now = new Date();
    if (
      payload.typ !== 'admin_refresh' ||
      !session ||
      session.adminId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.admin.status !== 'active' ||
      !(await bcrypt.compare(refreshToken, session.refreshTokenHash))
    ) {
      throw this.sessionEnded();
    }
    if (
      now.getTime() - session.lastUsedAt.getTime() >
      ADMIN_IDLE_MINUTES * 60_000
    ) {
      await this.prisma.platformAdminSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
      throw this.sessionEnded();
    }
    return this.sign(session.id, session.adminId, meta);
  }

  async logout(sessionId: string) {
    await this.prisma.platformAdminSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async profile(adminId: string): Promise<AdminProfile> {
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({
      where: { id: adminId },
      include: { role: true },
    });
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      roleKey: admin.roleKey,
      roleName: admin.role.name,
      permissions: this.permissionsFor(admin.role),
      lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
    };
  }

  private async issue(adminId: string, meta: AdminMeta): Promise<AdminTokens> {
    const session = await this.prisma.platformAdminSession.create({
      data: {
        adminId,
        refreshTokenHash: '',
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
        expiresAt: new Date(Date.now() + ADMIN_SESSION_MAX_HOURS * 3_600_000),
      },
    });
    return this.sign(session.id, adminId, meta);
  }

  private async sign(
    sessionId: string,
    adminId: string,
    meta: AdminMeta,
  ): Promise<AdminTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: adminId, sid: sessionId, typ: 'admin_access' },
      {
        secret: this.accessSecret(),
        expiresIn: ADMIN_ACCESS_TTL as unknown as number,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: adminId, sid: sessionId, typ: 'admin_refresh' },
      {
        secret: this.refreshSecret(),
        expiresIn: `${ADMIN_SESSION_MAX_HOURS}h` as unknown as number,
      },
    );
    await this.prisma.platformAdminSession.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash: await bcrypt.hash(refreshToken, 10),
        lastUsedAt: new Date(),
        ipAddress: meta.ipAddress ?? undefined,
      },
    });
    return { accessToken, refreshToken, admin: await this.profile(adminId) };
  }

  private challenge(adminId: string, stage: 'totp' | 'enroll') {
    return this.jwt.signAsync(
      { sub: adminId, typ: 'admin_challenge', stage },
      {
        secret: this.challengeSecret(),
        expiresIn: ADMIN_CHALLENGE_TTL as unknown as number,
      },
    );
  }

  private invalid() {
    return new AppException(
      SUPER_ADMIN_ERROR_CODES.INVALID_CREDENTIALS,
      'Invalid email or password.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  private sessionEnded() {
    return new AppException(
      SUPER_ADMIN_ERROR_CODES.SESSION_INVALID,
      'Your admin session has ended. Sign in again.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
