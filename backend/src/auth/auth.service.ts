import { emailVerificationSkipped } from './email-verification.flag';
import {
  HttpStatus,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { SecurityEventsService } from '../common/security/security-events.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { slugify } from '../common/utils/slug.util';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { DEFAULT_WORKING_HOURS } from '../bookings/bookings.constants';
import {
  SessionsService,
  type IssuedTokens,
  type SessionClaims,
} from './sessions.service';
import { AuthTokensService } from './auth-tokens.service';
import { AuthMailerService } from './auth-mailer.service';
import { MfaService } from './mfa/mfa.service';
import { normalizeEmail, PasswordService } from './security/password.service';
import { AuthRateLimitService } from './security/auth-rate-limit.service';
import { csrfTokenFor } from './security/auth-cookies';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { Prisma, Role } from '@prisma/client';

export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
  /** Coarse location (country code) when the edge provides one, e.g. Cloudflare `cf-ipcountry`. */
  country?: string;
  /** Raw value of the HttpOnly device cookie (or a fresh one the controller is about to set). */
  deviceId?: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

/** How the user proved who they are before `completeLogin` (recorded on the security event). */
export type LoginMethod =
  'password' | 'google' | 'microsoft' | 'facebook' | 'passkey';

/** Every sign-in path ends in one of these (the controller turns tokens into HttpOnly cookies). */
export type LoginOutcome =
  | {
      status: 'authenticated';
      user: PublicUser;
      tokens: IssuedTokens;
      csrfToken: string;
      mfaSetupRequired: boolean;
    }
  /** Password was right but the browser is new: a 6-digit code was emailed (§7.3 decision). */
  | { status: 'device_code'; ticket: string; email: string }
  /** A second factor (authenticator app, passkey or recovery code) is required. */
  | { status: 'mfa'; ticket: string; methods: string[] };

interface LoginTicket {
  sub: string;
  stage: 'device' | 'mfa';
  method: LoginMethod;
  remember: boolean;
  dh?: string;
  dv?: boolean;
}

const TICKET_TTL = '10m';
const STEP_UP_MS = 10 * 60_000;
const STUFFING_WINDOW_MS = 10 * 60_000;
const STUFFING_DISTINCT_ACCOUNTS = 20;

/** A business a member can sign into: owner-active, and not suspended/archived by Noxtill (itself
 * or, for a branch, its root). */
const PLATFORM_ACTIVE_BUSINESS: Prisma.BusinessWhereInput = {
  active: true,
  platformStatus: 'active',
  OR: [{ parentId: null }, { parent: { platformStatus: 'active' } }],
};

/**
 * Authentication core (auth security spec v1.0, 2026-11-14). Every method — password, Google,
 * Microsoft, Facebook, passkey — finishes in `completeLogin`, which enforces lockout, suspension,
 * device recognition, second factors and owner MFA enrolment before a session exists. Sessions are
 * opaque cookie tokens (`SessionsService`).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly capabilities: CapabilitiesService,
    private readonly sessions: SessionsService,
    private readonly mfa: MfaService,
    private readonly authTokens: AuthTokensService,
    private readonly passwords: PasswordService,
    private readonly rateLimit: AuthRateLimitService,
    @Optional() private readonly mailer?: AuthMailerService,
    @Optional() private readonly securityEvents?: SecurityEventsService,
  ) {
    this.sessions.onReuseDetected = (userId) => this.notifyReuse(userId);
  }

  // ------------------------------------------------------------------ signup

  /**
   * Email + password signup. The account is unusable until the email is verified (spec §3.2): the
   * global guard only lets an unverified session reach the verification endpoints.
   */
  async signup(dto: SignupDto, meta: RequestMeta = {}) {
    const email = dto.email ? normalizeEmail(dto.email) : undefined;
    const identityFilters: Prisma.UserWhereInput[] = [];
    if (email) identityFilters.push({ email });
    if (dto.phone) identityFilters.push({ phone: dto.phone });

    await this.passwords.assertAcceptable(dto.password);
    const existing = await this.prisma.user.findFirst({
      where: { OR: identityFilters },
    });
    if (existing) {
      throw new AppException(
        'ACCOUNT_EXISTS',
        'This email already has an account — log in instead',
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const { user, business, businessUser } = await this.prisma.$transaction(
      async (tx) => {
        const businessName = dto.businessName?.trim() || 'My business';
        const business = await tx.business.create({
          data: {
            name: businessName,
            slug: slugify(businessName),
            email,
            country: dto.country,
            currency: dto.currency ?? 'USD',
            locale: dto.locale ?? 'en',
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            // A real Mon-Fri 9-5 default so the public booking link works immediately.
            workingHours: DEFAULT_WORKING_HOURS,
          },
        });
        const user = await tx.user.create({
          data: {
            name: dto.name?.trim() || nameFromIdentity(email),
            email,
            phone: dto.phone,
            passwordHash,
            passwordHistory: [passwordHash],
            // Owners must add an authenticator app or passkey (spec §7.3).
            mfaRequired: true,
            emailVerifiedAt:
              email && !emailVerificationSkipped() ? null : new Date(),
          },
        });
        const businessUser = await tx.businessUser.create({
          data: { businessId: business.id, userId: user.id, role: Role.owner },
        });
        return { user, business, businessUser };
      },
    );

    await this.rememberDevice(user.id, meta);
    const tokens = await this.issueSession(user.id, businessUser, meta, {
      method: 'password',
      mfaSetupRequired: true,
    });
    const verificationEmailSent =
      user.email && !emailVerificationSkipped()
        ? await this.authTokens.sendVerifyEmail(user.id, user.email)
        : false;
    return {
      business,
      user: this.toPublicUser(user),
      verificationEmailSent,
      tokens,
      csrfToken: csrfTokenFor(tokens.sessionId),
    };
  }

  // ------------------------------------------------------------------ password sign-in

  async login(dto: LoginDto, meta: RequestMeta = {}): Promise<LoginOutcome> {
    const identifier = dto.emailOrPhone.includes('@')
      ? normalizeEmail(dto.emailOrPhone)
      : dto.emailOrPhone.trim();
    // Per account (whether or not it exists — never reveals which) and per IP (§10.1).
    await this.rateLimit.hit('loginIp', meta.ipAddress);
    await this.rateLimit.hit('loginAccount', identifier);

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    });
    const evt = {
      identifier,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    };

    if (!user) {
      // Same work as a real password check, so timing can't enumerate accounts (§6.3).
      await this.passwords.verifyDummy(dto.password);
      await this.securityEvents?.record({
        ...evt,
        type: 'login_unknown_account',
      });
      await this.detectStuffing(meta.ipAddress);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.passwords.verifyDummy(dto.password);
      await this.securityEvents?.record({
        ...evt,
        type: 'login_failed',
        userId: user.id,
        metadata: { reason: 'account_locked' },
      });
      throw this.lockedResponse(user.lockedUntil);
    }

    const valid =
      user.hasPassword &&
      (await this.passwords.verify(user.passwordHash, dto.password));
    if (!valid) {
      const locked = await this.registerFailedAttempt(
        user.id,
        user.failedLoginAttempts,
      );
      await this.securityEvents?.record({
        ...evt,
        type: locked ? 'account_locked' : 'login_failed',
        userId: user.id,
        metadata: {
          reason: 'bad_password',
          attempts: user.failedLoginAttempts + 1,
        },
      });
      await this.detectStuffing(meta.ipAddress);
      if (locked) {
        await this.onLocked(user.id, user.email);
        throw this.lockedResponse(
          new Date(Date.now() + this.lockMinutes() * 60_000),
        );
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    await this.rateLimit.reset('loginAccount', identifier);

    // Breach re-check at sign-in (§10.3) and forced resets (§3.2 destroyed credential).
    if (user.mustReset || (await this.passwords.isBreached(dto.password))) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { mustReset: true },
      });
      if (user.email)
        await this.authTokens.sendPasswordReset(user.id, user.email);
      throw new AppException(
        'PASSWORD_RESET_REQUIRED',
        'This password can no longer be used. We’ve emailed you a link to set a new one.',
        HttpStatus.FORBIDDEN,
      );
    }
    // Transparent upgrade of legacy bcrypt hashes to Argon2id.
    if (this.passwords.needsRehash(user.passwordHash)) {
      const rehashed = await this.passwords.hash(dto.password);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: rehashed },
      });
    }

    return this.completeLogin(user.id, meta, {
      method: 'password',
      identifier,
      rememberMe: dto.rememberMe,
    });
  }

  /**
   * The single gate every sign-in method finishes through once the identity itself is proven.
   * Order: lockout → suspension/deactivation → new-device email code (password only) → second
   * factor → session (owner without a second factor gets a setup-only session).
   */
  async completeLogin(
    userId: string,
    meta: RequestMeta,
    opts: {
      method: LoginMethod;
      identifier?: string;
      rememberMe?: boolean;
      deviceVerified?: boolean;
      mfaSatisfied?: boolean;
    },
  ): Promise<LoginOutcome> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const evt = {
      identifier: opts.identifier ?? user.email ?? user.phone ?? null,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    };

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.securityEvents?.record({
        ...evt,
        type: 'login_failed',
        userId: user.id,
        metadata: { reason: 'account_locked', method: opts.method },
      });
      throw this.lockedResponse(user.lockedUntil);
    }

    let businessUser: Awaited<
      ReturnType<AuthService['resolveActiveBusinessUser']>
    >;
    try {
      businessUser = await this.resolveActiveBusinessUser(user.id);
    } catch (error) {
      if (
        error instanceof AppException &&
        ['ACCOUNT_SUSPENDED', 'BUSINESS_SUSPENDED'].includes(
          (error.getResponse() as { code?: string }).code ?? '',
        )
      ) {
        await this.securityEvents?.record({
          ...evt,
          type: 'login_blocked_suspended',
          userId: user.id,
          metadata: {
            code: (error.getResponse() as { code?: string }).code,
            method: opts.method,
          },
        });
      }
      throw error;
    }

    const deviceHash = this.deviceHash(meta.deviceId);
    const knownDevice = deviceHash
      ? await this.isKnownDevice(user.id, deviceHash)
      : false;

    // New browser + password → prove the mailbox too (owner decision for spec §7.3).
    if (
      opts.method === 'password' &&
      !knownDevice &&
      !opts.deviceVerified &&
      user.email &&
      user.emailVerifiedAt
    ) {
      await this.rateLimit.hit('otpRequestAccount', user.email);
      await this.rateLimit.hit('otpRequestIp', meta.ipAddress);
      await this.authTokens.sendEmailCode(user.id, user.email, 'login_device');
      return {
        status: 'device_code',
        ticket: await this.ticket({
          sub: user.id,
          stage: 'device',
          method: opts.method,
          remember: opts.rememberMe !== false,
          dh: deviceHash ?? undefined,
        }),
        email: maskEmail(user.email),
      };
    }

    // Second factor (a passkey sign-in is itself possession + user verification).
    const methods = await this.mfa.methods(user.id);
    if (opts.method !== 'passkey' && !opts.mfaSatisfied && methods.length) {
      return {
        status: 'mfa',
        ticket: await this.ticket({
          sub: user.id,
          stage: 'mfa',
          method: opts.method,
          remember: opts.rememberMe !== false,
          dh: deviceHash ?? undefined,
          dv: opts.deviceVerified || knownDevice,
        }),
        methods,
      };
    }
    const mfaSetupRequired =
      methods.length === 0 && (await this.mfa.isRequired(user.id));

    await this.securityEvents?.record({
      ...evt,
      type: knownDevice ? 'login_success' : 'login_new_device',
      userId: user.id,
      businessId: businessUser.businessId,
      metadata: { method: opts.method, mfaSetupRequired },
    });
    if (!knownDevice) {
      await this.rememberDevice(user.id, meta);
      // The device-code email already told a password user about the new device.
      if (opts.method !== 'password' && user.email)
        await this.newDeviceAlert(user.email, meta);
    } else if (deviceHash) {
      await this.prisma.knownDevice.updateMany({
        where: { userId: user.id, deviceHash },
        data: { lastSeen: new Date() },
      });
    }

    const tokens = await this.issueSession(user.id, businessUser, meta, {
      shared: opts.rememberMe === false,
      method: opts.method,
      mfaSetupRequired,
    });
    return {
      status: 'authenticated',
      user: this.toPublicUser(user),
      tokens,
      csrfToken: csrfTokenFor(tokens.sessionId),
      mfaSetupRequired,
    };
  }

  /** Stage 2 of a new-device password sign-in: the emailed code. */
  async verifyLoginDevice(
    ticket: string,
    code: string,
    meta: RequestMeta,
  ): Promise<LoginOutcome> {
    const t = await this.readTicket(ticket, 'device');
    await this.rateLimit.hit('otpVerifyIp', meta.ipAddress);
    if (t.dh && this.deviceHash(meta.deviceId) !== t.dh)
      throw this.ticketError();
    await this.authTokens.verifyEmailOtp(t.sub, code, 'login_device');
    return this.completeLogin(t.sub, meta, {
      method: t.method,
      rememberMe: t.remember,
      deviceVerified: true,
    });
  }

  /** Stage 3: authenticator-app or recovery code. */
  async verifyLoginMfa(
    ticket: string,
    input: { code?: string; recoveryCode?: string },
    meta: RequestMeta,
  ): Promise<LoginOutcome> {
    const t = await this.readTicket(ticket, 'mfa');
    await this.rateLimit.hit('otpVerifyIp', meta.ipAddress);
    try {
      await this.mfa.verify(t.sub, input);
    } catch (err) {
      await this.securityEvents?.record({
        type: 'mfa_failed',
        userId: t.sub,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      });
      throw err;
    }
    return this.completeLogin(t.sub, meta, {
      method: t.method,
      rememberMe: t.remember,
      deviceVerified: t.dv,
      mfaSatisfied: true,
    });
  }

  /** Stage 3 answered with a passkey (PasskeysService verified the assertion for `userId`). */
  async completeMfaWithPasskey(
    ticket: string,
    userId: string,
    meta: RequestMeta,
  ) {
    const t = await this.readTicket(ticket, 'mfa');
    if (t.sub !== userId) throw this.ticketError();
    return this.completeLogin(t.sub, meta, {
      method: t.method,
      rememberMe: t.remember,
      deviceVerified: t.dv,
      mfaSatisfied: true,
    });
  }

  async ticketUser(ticket: string): Promise<string> {
    return (await this.readTicket(ticket, 'mfa')).sub;
  }

  // ------------------------------------------------------------------ sessions

  async refresh(refreshToken: string) {
    const rotated = await this.sessions.rotate(
      refreshToken,
      async (session) => {
        // Re-resolved (not trusted from the old session) so role/custom-role changes, business
        // deactivation and staff deactivation apply at the next refresh.
        const businessUser = await this.prisma.businessUser.findFirst({
          where: {
            userId: session.userId,
            businessId: session.businessId,
            active: true,
            business: PLATFORM_ACTIVE_BUSINESS,
            user: { platformStatus: 'active' },
          },
        });
        if (!businessUser) {
          throw new AppException(
            'INVALID_REFRESH',
            'Your session has ended. Please sign in again.',
            HttpStatus.UNAUTHORIZED,
          );
        }
        return this.claimsFor(businessUser);
      },
    );
    await this.rateLimit.hit('refreshAccount', rotated.userId);
    return { tokens: rotated, csrfToken: csrfTokenFor(rotated.sessionId) };
  }

  /** Ends the caller's session server-side: its access token and whole refresh family (§9.1). */
  async logout(user: AuthenticatedUser) {
    if (!user.sessionId) return;
    await this.sessions.revoke(user.sessionId, 'logout');
    await this.securityEvents?.record({
      type: 'logout',
      userId: user.sub,
      businessId: user.businessId,
    });
  }

  async logoutAll(user: AuthenticatedUser) {
    const count = await this.sessions.revokeAllForUser(user.sub, 'logout_all');
    await this.securityEvents?.record({
      type: 'logout_all',
      userId: user.sub,
      metadata: { count },
    });
    return { revoked: count };
  }

  async sessionInfo(user: AuthenticatedUser) {
    const [session, u] = await Promise.all([
      user.sessionId ? this.sessions.findActive(user.sessionId) : null,
      this.prisma.user.findUnique({
        where: { id: user.sub },
        select: { emailVerifiedAt: true, email: true },
      }),
    ]);
    return {
      csrfToken: user.sessionId ? csrfTokenFor(user.sessionId) : null,
      mfaSetupRequired: !!session?.mfaSetupRequired,
      emailVerified: !u?.email || !!u?.emailVerifiedAt,
      stepUpValidUntil:
        session?.stepUpAt &&
        session.stepUpAt.getTime() + STEP_UP_MS > Date.now()
          ? new Date(session.stepUpAt.getTime() + STEP_UP_MS)
          : null,
    };
  }

  /** Step-up re-authentication for elevated actions (billing, payroll, exports — §8.5). */
  async stepUp(
    user: AuthenticatedUser,
    input: { password?: string; code?: string; recoveryCode?: string },
  ) {
    if (!user.sessionId) throw new UnauthorizedException();
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.sub },
    });
    let ok = false;
    if (input.password && u.hasPassword) {
      ok = await this.passwords.verify(u.passwordHash, input.password);
    }
    if (!ok && (input.code || input.recoveryCode)) {
      ok = await this.mfa.verify(user.sub, input).then(
        () => true,
        () => false,
      );
    }
    if (!ok) {
      throw new AppException(
        'STEP_UP_FAILED',
        "That didn't match. Try again.",
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.sessions.markStepUp(user.sessionId);
    await this.securityEvents?.record({
      type: 'step_up',
      userId: user.sub,
      businessId: user.businessId,
    });
    return { validUntil: new Date(Date.now() + STEP_UP_MS) };
  }

  /** Marks the session stepped-up after a passkey assertion (PasskeysService). */
  async stepUpWithPasskey(user: AuthenticatedUser) {
    if (!user.sessionId) throw new UnauthorizedException();
    await this.sessions.markStepUp(user.sessionId);
    await this.securityEvents?.record({
      type: 'step_up',
      userId: user.sub,
      metadata: { method: 'passkey' },
    });
    return { validUntil: new Date(Date.now() + STEP_UP_MS) };
  }

  // ------------------------------------------------------------------ internals

  /**
   * Branches depth fix (UPD-INT-012) / Staff v2: only resolves membership in a business that is
   * really `active`, and distinguishes the failure reasons with honest messages.
   */
  async resolveActiveBusinessUser(userId: string) {
    const person = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { platformStatus: true },
    });
    if (person && person.platformStatus !== 'active') {
      throw new AppException(
        'ACCOUNT_SUSPENDED',
        'This account has been suspended by Noxtill — contact Noxtill support',
        HttpStatus.FORBIDDEN,
      );
    }
    const businessUser = await this.prisma.businessUser.findFirst({
      where: { userId, active: true, business: PLATFORM_ACTIVE_BUSINESS },
      orderBy: { createdAt: 'asc' },
    });
    if (businessUser) return businessUser;

    const anyMembership = await this.prisma.businessUser.findFirst({
      where: { userId },
      select: {
        id: true,
        active: true,
        business: {
          select: {
            active: true,
            platformStatus: true,
            parent: { select: { platformStatus: true } },
          },
        },
      },
    });
    const platformBlocked =
      anyMembership &&
      (anyMembership.business.platformStatus !== 'active' ||
        (anyMembership.business.parent?.platformStatus ?? 'active') !==
          'active');
    if (anyMembership?.active !== false && platformBlocked) {
      throw new AppException(
        'BUSINESS_SUSPENDED',
        'This business account has been suspended by Noxtill — contact Noxtill support',
        HttpStatus.FORBIDDEN,
      );
    }
    if (anyMembership?.active === false) {
      throw new AppException(
        'STAFF_DEACTIVATED',
        'This account has been deactivated — contact the business owner',
        HttpStatus.FORBIDDEN,
      );
    }
    if (anyMembership) {
      throw new AppException(
        'BUSINESS_DEACTIVATED',
        'This account is only linked to a deactivated business — contact the business owner',
        HttpStatus.FORBIDDEN,
      );
    }
    throw new UnauthorizedException('No business associated with this account');
  }

  private async claimsFor(bu: {
    businessId: string;
    role: Role;
    customRoleId: string | null;
  }): Promise<SessionClaims> {
    const capabilities = await this.capabilities.resolve({
      businessId: bu.businessId,
      role: bu.role,
      customRoleId: bu.customRoleId,
    });
    return { role: bu.role, customRoleId: bu.customRoleId, capabilities };
  }

  private async issueSession(
    userId: string,
    bu: { businessId: string; role: Role; customRoleId: string | null },
    meta: RequestMeta,
    opts: { shared?: boolean; method: LoginMethod; mfaSetupRequired?: boolean },
  ): Promise<IssuedTokens> {
    return this.sessions.create(
      userId,
      bu.businessId,
      await this.claimsFor(bu),
      meta,
      opts,
    );
  }

  private lockMinutes() {
    return Number(this.config.get('LOGIN_LOCK_MINUTES') ?? 15);
  }

  /** Spec §10.1: 10 failures then a 15-minute lock on the account itself. */
  private async registerFailedAttempt(
    userId: string,
    currentAttempts: number,
  ): Promise<boolean> {
    const maxAttempts = Number(this.config.get('LOGIN_MAX_ATTEMPTS') ?? 10);
    const attempts = currentAttempts + 1;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil:
          attempts >= maxAttempts
            ? new Date(Date.now() + this.lockMinutes() * 60_000)
            : undefined,
      },
    });
    return attempts >= maxAttempts;
  }

  /** A lock looks like a plain rate limit (429 + Retry-After) — never confirms the account exists. */
  private lockedResponse(until: Date) {
    const err = new AppException(
      'RATE_LIMITED',
      'Too many attempts. Try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
    (err as AppException & { retryAfterSeconds?: number }).retryAfterSeconds =
      Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
    return err;
  }

  /** Lock = mandatory revocation event (§9.3) + owner notification (§10.1). */
  private async onLocked(userId: string, email: string | null) {
    await this.sessions.revokeAllForUser(userId, 'account_locked');
    if (email) {
      await this.mailer?.sendNotice(email, {
        subject: 'Your Noxtill account was locked',
        heading: 'Too many wrong passwords',
        body: `Someone entered the wrong password for your Noxtill account too many times, so sign-in is paused for ${this.lockMinutes()} minutes and every device was signed out. If this wasn’t you, reset your password.`,
        cta: 'Reset password',
        path: '/forgot-password',
        footnote:
          'You’re receiving this because of a security event on your Noxtill account.',
      });
    }
  }

  /** §10.3: many distinct accounts failing from one network range → alert and slow the range. */
  private async detectStuffing(ip?: string) {
    if (!ip) return;
    const range = ip.includes(':')
      ? ip.split(':').slice(0, 4).join(':')
      : ip.split('.').slice(0, 3).join('.');
    const since = new Date(Date.now() - STUFFING_WINDOW_MS);
    const rows = await this.prisma.securityEvent.findMany({
      where: {
        type: { in: ['login_failed', 'login_unknown_account'] },
        createdAt: { gte: since },
        ipAddress: { startsWith: range },
      },
      select: { identifier: true },
      distinct: ['identifier'],
      take: STUFFING_DISTINCT_ACCOUNTS + 1,
    });
    if (rows.length === STUFFING_DISTINCT_ACCOUNTS) {
      await this.securityEvents?.record({
        type: 'credential_stuffing_suspected',
        ipAddress: ip,
        metadata: {
          range,
          distinctAccounts: rows.length,
          windowMinutes: STUFFING_WINDOW_MS / 60_000,
        },
      });
    }
    if (rows.length >= STUFFING_DISTINCT_ACCOUNTS) {
      // Raise the bar for the whole range: it shares one tight bucket while the burst lasts.
      await this.rateLimit.hit('otpRequestIp', `stuffing:${range}`);
    }
  }

  private deviceHash(deviceId?: string): string | null {
    if (!deviceId) return null;
    const pepper =
      process.env.AUTH_OTP_PEPPER ||
      `${this.config.get<string>('JWT_SECRET') ?? 'dev'}:device`;
    return createHmac('sha256', pepper).update(deviceId).digest('hex');
  }

  private async isKnownDevice(userId: string, deviceHash: string) {
    return !!(await this.prisma.knownDevice.findUnique({
      where: { userId_deviceHash: { userId, deviceHash } },
      select: { id: true },
    }));
  }

  private async rememberDevice(userId: string, meta: RequestMeta) {
    const deviceHash = this.deviceHash(meta.deviceId);
    if (!deviceHash) return;
    await this.prisma.knownDevice.upsert({
      where: { userId_deviceHash: { userId, deviceHash } },
      create: { userId, deviceHash, userAgent: meta.userAgent?.slice(0, 500) },
      update: { lastSeen: new Date() },
    });
  }

  /** §8.4: email on a sign-in from an unrecognised device. */
  private async newDeviceAlert(email: string, meta: RequestMeta) {
    const when = new Date().toUTCString();
    const where = [meta.country, meta.ipAddress].filter(Boolean).join(' · ');
    await this.mailer?.sendNotice(email, {
      subject: 'New sign-in to your Noxtill account',
      heading: 'New device signed in',
      body: `Your Noxtill account was signed in to from a new device on ${when}${where ? ` (${where})` : ''}${meta.userAgent ? `, using ${meta.userAgent.slice(0, 120)}` : ''}. If this was you, there’s nothing to do. If not, sign out every device and change your password.`,
      cta: 'Review sign-ins',
      path: '/settings/tools/security',
      footnote:
        'You’re receiving this because of a security event on your Noxtill account.',
    });
  }

  private async notifyReuse(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user?.email) return;
    await this.mailer?.sendNotice(user.email, {
      subject: 'We signed you out of Noxtill everywhere',
      heading: 'A session token was reused',
      body: 'A sign-in token for your Noxtill account was used twice, which can mean it was copied from one of your devices. To protect you we signed out every device. Sign in again, and change your password if you don’t recognise recent activity.',
      cta: 'Sign in',
      path: '/login',
      footnote:
        'You’re receiving this because of a security event on your Noxtill account.',
    });
  }

  private ticketSecret() {
    return `${this.config.get<string>('JWT_SECRET')}:login-ticket`;
  }

  private ticket(payload: LoginTicket) {
    return this.jwt.signAsync(
      { ...payload, n: randomBytes(8).toString('hex') },
      { secret: this.ticketSecret(), expiresIn: TICKET_TTL },
    );
  }

  private ticketError() {
    return new AppException(
      'SIGN_IN_EXPIRED',
      'This sign-in has expired. Please start again.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  private async readTicket(
    ticket: string,
    stage: LoginTicket['stage'],
  ): Promise<LoginTicket> {
    let t: LoginTicket;
    try {
      t = await this.jwt.verifyAsync<LoginTicket>(ticket, {
        secret: this.ticketSecret(),
      });
    } catch {
      throw this.ticketError();
    }
    if (t.stage !== stage) throw this.ticketError();
    return t;
  }

  toPublicUser(user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  }): PublicUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    };
  }
}

/** "emily@greenleafsalon.com" → "Emily" — a placeholder until the owner's real name is known. */
export function nameFromIdentity(email?: string): string {
  const local = email?.split('@')[0]?.split(/[._+-]/)[0] ?? '';
  if (local.length >= 2) {
    return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
  }
  return 'Owner';
}

/** o••••@salon.com — enough to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(1, Math.min(4, local.length - 1)))}@${domain}`;
}
